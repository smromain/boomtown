import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { ClientMessage, RoomMessage } from '@boomtown/protocol';
import { PROTOCOL_VERSION, mintRoomAddress } from '@boomtown/protocol';

/**
 * #63, against a real room rather than the in-memory fake.
 *
 * The bug is that "started, nobody has moved yet" and "still in the lobby" were
 * the same bytes in storage, so a room that lost its memory in that window woke
 * into the lobby and answered the opening move with "no game in progress".
 *
 * Losing its memory is the part a test cannot simply ask for: workerd decides
 * when to evict a hibernating object, and nothing a client sends forces it. So
 * this drives the same wake from the other end — **the dev server is stopped
 * and started again**. PartyKit persists each room's storage on disk under
 * `.partykit/state`, so the second server finds the first one's bytes, and the
 * room comes up through the real `onStart` -> `GameRoom.rehydrate` path on the
 * real substrate. That is the path hibernation takes; only the trigger differs.
 *
 * It runs on its own port with its own server, because the suite's shared
 * `partykit dev` (globalSetup) has to stay up for every other test.
 */
const PORT = 2001;
const HOST = `127.0.0.1:${PORT}`;
const serverDir = fileURLToPath(new URL('..', import.meta.url));
/**
 * Its own persistence directory. Sharing `.partykit/state` with the suite's
 * other dev server means two workerd processes holding the same SQLite files,
 * and the second one fails to come up. The directory is *not* cleaned between
 * this file's two boots — carrying the first server's bytes over is the whole
 * point.
 */
const STATE_DIR = fileURLToPath(new URL('../.partykit/state-hibernation', import.meta.url));

let server: ChildProcess | undefined;
let serverOutput: () => string = () => '';

const portOpen = () =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect(PORT, '127.0.0.1');
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });

/**
 * Readiness is an answered HTTP request, not an open port: `partykit dev` binds
 * before workerd has the bundle, and a socket that connects to a server with no
 * worker behind it accepts the WebSocket and then says nothing at all.
 *
 * `node:http` rather than `fetch`, because this environment routes fetch through
 * an agent proxy that will answer whether or not anything is listening.
 */
const serving = () =>
  new Promise<boolean>((resolve) => {
    const request = http.get({ host: '127.0.0.1', port: PORT, path: '/', timeout: 2000 }, (res) => {
      res.resume();
      resolve(true);
    });
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });

async function startServer(): Promise<void> {
  server = spawn('npx', ['partykit', 'dev', '--port', String(PORT), '--persist', STATE_DIR], {
    cwd: serverDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  let output = '';
  server.stdout?.on('data', (d: Buffer) => (output += d.toString()));
  server.stderr?.on('data', (d: Buffer) => (output += d.toString()));
  serverOutput = () => output;
  // A real TCP connect, not an HTTP probe: this environment may route fetch
  // through a proxy that answers whether or not anything is listening.
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (await serving()) {
      await new Promise((r) => setTimeout(r, 500));
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`partykit dev did not listen on ${PORT}\n${serverOutput()}`);
}

async function stopServer(): Promise<void> {
  if (!server) return;
  const exited = new Promise((r) => server!.on('exit', r));
  server.kill('SIGTERM');
  await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
  if (!server.killed) server.kill('SIGKILL');
  server = undefined;
  // Wait for the port to come free before the next boot claims it.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!(await portOpen())) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}

afterAll(stopServer);

/** The same thin client as `room.integration.test.ts`, on this file's port. */
class Client {
  private ws: WebSocket;
  private queue: RoomMessage[] = [];
  readonly open: Promise<void>;

  constructor(room: string, params: Record<string, string> = {}) {
    const qs = new URLSearchParams({ v: PROTOCOL_VERSION, name: 'Tester', ...params });
    this.ws = new WebSocket(`ws://${HOST}/parties/main/${room}?${qs}`);
    this.open = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ws did not open in 10s')), 10_000);
      this.ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('ws connection failed'));
      });
    });
    this.ws.addEventListener('message', (ev) => {
      this.queue.push(JSON.parse(String((ev as MessageEvent).data)) as RoomMessage);
    });
  }

  send(message: ClientMessage): void {
    this.ws.send(JSON.stringify(message));
  }

  /** Next message of a type, with a timeout. Messages are never discarded. */
  async next(type: RoomMessage['type'], ms = 8000): Promise<RoomMessage> {
    const deadline = Date.now() + ms;
    for (;;) {
      const index = this.queue.findIndex((m) => m.type === type);
      if (index >= 0) return this.queue.splice(index, 1)[0]!;
      if (Date.now() > deadline) {
        throw new Error(`timeout waiting for ${type}; saw ${this.queue.map((m) => m.type).join(', ')}`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  close(): void {
    this.ws.close();
  }
}

describe('a room that loses its memory between start and the first move (#63)', () => {
  it('wakes up playing rather than back in the lobby', async () => {
    await startServer();
    const room = mintRoomAddress();

    // One human on the clock and two bots behind them. The human opens, which
    // is exactly the window the bug lives in: a bot's first command would land
    // in the log immediately and close it.
    const host = new Client(room);
    await host.open;
    host.send({
      type: 'create-room',
      config: { seatCount: 3, edition: 'classic', visibility: 'open', bots: { 1: 6, 2: 6 }, seed: 42 },
    });
    await host.next('welcome');

    host.send({ type: 'start' });
    const first = (await host.next('update')) as Extract<RoomMessage, { type: 'update' }>;
    expect(first.view.status).toBe('playing');
    expect(first.view.activeSeat).toBe(0); // nobody has moved, and it is the human's turn
    host.close();

    // The room forgets everything it did not write down.
    await stopServer();
    await startServer();

    // A fresh connection, not a reconnect: a process restart drops each
    // connection's persisted `{ seat, token }` state, which a real hibernation
    // wake keeps and feeds back through `restoreSeat`. So this half asks the
    // room the one question the bug turned on and that a seatless connection
    // can still ask — **what phase are you in** — and leaves "and the opening
    // command is accepted" to `persistence.test.ts`, where the seat binding can
    // be restored the way a wake restores it.
    const onlooker = new Client(room);
    await onlooker.open;
    onlooker.send({ type: 'knock' });
    await onlooker.next('waiting');
    const state = (await onlooker.next('room-state')) as Extract<RoomMessage, { type: 'room-state' }>;
    // Before the started marker this read `lobby`: the log was empty, and an
    // empty log said nothing about whether the game had been dealt. A room in
    // the lobby then accepts a fresh `start` and re-deals, and answers the
    // opening move with "no game in progress".
    expect(state.state.phase).toBe('playing');
    onlooker.close();
  }, 240_000);
});
