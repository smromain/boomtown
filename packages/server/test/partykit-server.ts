import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = 1999;
const serverDir = fileURLToPath(new URL('..', import.meta.url));

let child: ChildProcess | undefined;

/** Vitest globalSetup: boot `partykit dev` once, tear it down after the suite. */
export async function setup(): Promise<void> {
  child = spawn('npx', ['partykit', 'dev', '--port', String(PORT)], {
    cwd: serverDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  let stderr = '';
  child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`partykit dev did not become ready in 45s\n${stderr}`));
    }, 45_000);

    const onData = (d: Buffer) => {
      if (d.toString().includes(`:${PORT}`) || d.toString().includes('Ready on')) {
        clearTimeout(timer);
        child?.stdout?.off('data', onData);
        // give workerd a beat to finish binding the socket
        setTimeout(resolve, 500);
      }
    };
    child?.stdout?.on('data', onData);
    child?.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`partykit dev exited early (code ${code})\n${stderr}`));
    });
  });
}

export async function teardown(): Promise<void> {
  if (!child) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (!child.killed) child.kill('SIGKILL');
}

export const PARTYKIT_PORT = PORT;
