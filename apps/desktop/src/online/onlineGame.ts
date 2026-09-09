import { createGameClient, netlog, socketTransport, type GameClient, type SocketExtras } from '@boomtown/client-core';
import type { RoomConfig, RoomState } from '@boomtown/protocol';
import type { GameConfig } from '../setup/gameConfig.js';
import { partykitHost } from './hostUrl.js';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

/** An online game in progress or forming, wired to a PartyKit room. */
export interface OnlineGame {
  readonly client: GameClient;
  readonly transport: SocketExtras;
  readonly config: GameConfig;
  readonly roomCode: string;
  /** True for the player who created the room and may start it. */
  readonly isHost: boolean;
  disconnect(): void;
}

/** Turn a desktop `GameConfig` into the room's `RoomConfig` (bot seats by index). */
export function toRoomConfig(config: GameConfig): RoomConfig {
  const bots: Record<number, number> = {};
  config.seats.forEach((seat, index) => {
    if (seat.kind === 'bot') bots[index] = seat.difficulty;
  });
  return {
    seatCount: config.seats.length,
    edition: config.edition,
    visibility: config.visibility,
    bots,
    ...(config.seed !== undefined ? { seed: config.seed } : {}),
  };
}

interface BuildOptions {
  readonly config: GameConfig;
  readonly roomCode: string;
  readonly name: string;
  readonly intent: Parameters<typeof socketTransport>[0]['intent'];
  readonly isHost: boolean;
  readonly token?: string;
}

async function build({ config, roomCode, name, intent, isHost, token }: BuildOptions): Promise<OnlineGame> {
  let host: string;
  try {
    host = partykitHost();
  } catch (error) {
    // No host baked into the build and none set in Settings. Say so in the
    // timeline too — a packaged build that cannot resolve a host is the other
    // way online play "does nothing".
    netlog.log('online', 'warn', 'no online host configured', { error: String(error) });
    throw error;
  }
  netlog.log('online', 'note', `${intent.kind} room`, {
    host,
    roomCode,
    name,
    isHost,
    hasToken: Boolean(token),
    seats: config.seats.map((seat, index) => `${index}:${seat.kind}`),
  });

  const transport = socketTransport({
    host,
    room: roomCode,
    name,
    intent,
    ...(token ? { token } : {}),
  });
  const client = createGameClient(transport);
  try {
    await client.connect();
  } catch (error) {
    netlog.log('online', 'warn', `${intent.kind} failed`, { host, roomCode, error: String(error) });
    client.disconnect();
    throw error;
  }
  netlog.log('online', 'note', `${intent.kind} connected`, {
    host,
    roomCode,
    seat: transport.seat(),
    roomState: transport.roomState()?.phase ?? null,
  });
  return {
    client,
    transport,
    config,
    roomCode,
    isHost,
    disconnect: () => client.disconnect(),
  };
}

/** Create a new room and take seat 0. */
export function createRoom(config: GameConfig, roomCode: string, name: string): Promise<OnlineGame> {
  return build({
    config,
    roomCode,
    name,
    intent: { kind: 'create', config: toRoomConfig(config) },
    isHost: true,
  });
}

/** Join an existing room by code. The real config arrives via `room-state`. */
export function joinRoom(placeholder: GameConfig, roomCode: string, name: string): Promise<OnlineGame> {
  return build({ config: placeholder, roomCode, name, intent: { kind: 'join' }, isHost: false });
}

/** Reconnect into a seat we already hold, presenting the session token. */
export function resumeRoom(
  config: GameConfig,
  roomCode: string,
  name: string,
  token: string,
): Promise<OnlineGame> {
  return build({ config, roomCode, name, intent: { kind: 'resume' }, isHost: false, token });
}

export type { RoomState };
