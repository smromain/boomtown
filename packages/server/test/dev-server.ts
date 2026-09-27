import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = 1999;
const serverDir = fileURLToPath(new URL('..', import.meta.url));

let child: ChildProcess | undefined;

/** Vitest globalSetup: boot `wrangler dev` once, tear it down after the suite. */
export async function setup(): Promise<void> {
  child = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1'], {
    cwd: serverDir,
    // Its own process group, so teardown reaches workerd: wrangler runs as a
    // chain of child processes that outlive a signal sent to `npx` alone.
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });

  let stderr = '';
  child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`wrangler dev did not become ready in 45s\n${stderr}`));
    }, 45_000);

    const onData = (d: Buffer) => {
      if (d.toString().includes('Ready on')) {
        clearTimeout(timer);
        child?.stdout?.off('data', onData);
        // give workerd a beat to finish binding the socket
        setTimeout(resolve, 500);
      }
    };
    child?.stdout?.on('data', onData);
    child?.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`wrangler dev exited early (code ${code})\n${stderr}`));
    });
  });
}

export async function teardown(): Promise<void> {
  if (!child?.pid) return;
  const group = -child.pid;
  const signal = (s: NodeJS.Signals) => {
    try {
      process.kill(group, s);
    } catch {
      // already gone
    }
  };
  signal('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 1000));
  signal('SIGKILL');
}

export const DEV_SERVER_PORT = PORT;
