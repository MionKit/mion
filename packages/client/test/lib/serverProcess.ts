/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {fork, type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export interface ServerProcess {
  port: number;
  stop(): Promise<void>;
}

/** How long a server may take to come up: a vite server plus a resolver session. */
const START_TIMEOUT_MS = 180_000;

export async function forkServer(label: string, args: string[]): Promise<ServerProcess> {
  const entry = fileURLToPath(new URL('./serverChild.mjs', import.meta.url));
  // execArgv: [] because a test worker runs under `--conditions source`, which would make node load raw TypeScript
  const child = fork(entry, args, {
    execArgv: [],
    env: {...process.env, NODE_ENV: 'test'},
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  const port = await startedPort(child, label).catch((error: unknown) => {
    child.kill();
    throw error;
  });
  return {port, stop: () => stop(child)};
}

function startedPort(child: ChildProcess, label: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} did not start within ${START_TIMEOUT_MS}ms`)), START_TIMEOUT_MS);
    child.once('message', (message: {port?: number}) => {
      clearTimeout(timer);
      if (typeof message?.port !== 'number') return reject(new Error(`${label} sent no port`));
      resolve(message.port);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`${label} exited with code ${code} before it listened`));
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
