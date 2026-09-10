/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Vitest globalSetup of the bundled and mixed lanes: their test server, one process per lane.
//
// Each lane is its own program (its own tsconfig, genDir and `bundleApi` value), and its server has
// to come from THAT program: it is the batch source the lane's resolver compiles the lane's batches
// into. The fetched lane starts its server in vitest's main process, but the router's registries are
// process-wide globals (single-instance state), so a second lane cannot start another server there,
// and the specs' cache resets rule out the worker too (a server sharing the client's process would
// share the caches the specs wipe, and nothing would ever be fetched or bundled). So each lane forks
// laneServerChild.mjs, which opens a vite server over the lane's own config, imports the test-server
// entry through it and listens on a free port; the port reaches the specs through vitest's provide /
// inject.
import {fork, type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import type {TestProject} from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Base URL of this lane's own test server (see test/lib/laneServer.ts). */
    laneServerBaseURL: string;
  }
}

/** How long the lane server may take to come up: a vite server plus a resolver session. */
const START_TIMEOUT_MS = 180_000;

let child: ChildProcess | undefined;

export async function setup(project: TestProject): Promise<void> {
  const configFile = project.vite.config.configFile;
  if (!configFile) throw new Error(`lane server: project ${project.name} has no config file to start the server from`);
  const entry = fileURLToPath(new URL('./laneServerChild.mjs', import.meta.url));
  const spawned = fork(entry, [configFile], {
    env: {...process.env, NODE_ENV: 'test'},
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  child = spawned;
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`lane server for ${project.name} did not start within ${START_TIMEOUT_MS}ms`)),
      START_TIMEOUT_MS
    );
    spawned.once('message', (message: {port?: number}) => {
      clearTimeout(timer);
      if (typeof message?.port !== 'number') return reject(new Error(`lane server for ${project.name} sent no port`));
      resolve(message.port);
    });
    spawned.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`lane server for ${project.name} exited with code ${code} before it listened`));
    });
  });
  project.provide('laneServerBaseURL', `http://localhost:${port}`);
}

export async function teardown(): Promise<void> {
  const closing = child;
  child = undefined;
  if (!closing || closing.exitCode !== null) return;
  await new Promise<void>((done) => {
    closing.once('exit', () => done());
    closing.send('close');
  });
}
