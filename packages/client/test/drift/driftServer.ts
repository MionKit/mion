/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {fork, type ChildProcess} from 'node:child_process';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';

export type DriftServerName = 'a' | 'b' | 'c';

/** A vite server plus a resolver session per start. */
const START_TIMEOUT_MS = 180_000;

/** One port for every server, so the client sees one address whose server changed. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const {port} = probe.address() as {port: number};
      probe.close(() => resolve(port));
    });
  });
}

export async function startDriftServer(name: DriftServerName, port: number): Promise<() => Promise<void>> {
  const entry = fileURLToPath(new URL('./driftServerChild.mjs', import.meta.url));
  // execArgv: [] because a test worker runs under `--conditions source`, which would make node load raw TypeScript
  const child = fork(entry, [name, String(port)], {
    execArgv: [],
    env: {...process.env, NODE_ENV: 'test'},
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  await started(child, name).catch((error: unknown) => {
    child.kill();
    throw error;
  });
  return () => stop(child);
}

function started(child: ChildProcess, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`drift server ${name} did not start in time`)), START_TIMEOUT_MS);
    child.once('message', () => {
      clearTimeout(timer);
      resolve();
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`drift server ${name} exited with code ${code} before it listened`));
    });
  });
}

function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((done) => {
    child.once('exit', () => done());
    child.send('close');
  });
}
