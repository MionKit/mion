/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Vitest globalSetup of the bundled lane: forks laneServerChild.mjs so the test server comes from the lane's own
// program, its batch source. Not vitest's main process: the router's registries are process-wide and the fetched
// lane's server is already there. Not the worker: the specs' cache resets would wipe the server's caches too.
// The port reaches the specs through vitest's provide / inject.
import {fork, type ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import type {TestProject} from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Base URL of this lane's own test server (see test/lib/laneServer.ts). */
    laneServerBaseURL: string;
    /** The vite root the lane server compiled under, which must be this project's root (laneServerChild.mjs). */
    laneServerRoot: string;
  }
}

/** How long the lane server may take to come up: a vite server plus a resolver session. */
const START_TIMEOUT_MS = 180_000;

let child: ChildProcess | undefined;

export async function setup(project: TestProject): Promise<void> {
  const configFile = project.vite.config.configFile;
  if (!configFile) throw new Error(`lane server: project ${project.name} has no config file to start the server from`);
  const entry = fileURLToPath(new URL('./laneServerChild.mjs', import.meta.url));
  // The child roots its vite server where vitest roots this project, so both name the shared genDir's modules alike.
  const spawned = fork(entry, [configFile, project.config.root], {
    env: {...process.env, NODE_ENV: 'test'},
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  child = spawned;
  const {port, root} = await startedPort(spawned, project.name).catch((error: unknown) => {
    // vitest never runs teardown for a globalSetup that threw, so the fork would outlive the run
    spawned.kill();
    child = undefined;
    throw error;
  });
  project.provide('laneServerBaseURL', `http://localhost:${port}`);
  project.provide('laneServerRoot', root);
}

function startedPort(spawned: ChildProcess, name: string): Promise<{port: number; root: string}> {
  return new Promise<{port: number; root: string}>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`lane server for ${name} did not start within ${START_TIMEOUT_MS}ms`)),
      START_TIMEOUT_MS
    );
    spawned.once('message', (message: {port?: number; root?: string}) => {
      clearTimeout(timer);
      if (typeof message?.port !== 'number') return reject(new Error(`lane server for ${name} sent no port`));
      resolve({port: message.port, root: message.root ?? ''});
    });
    spawned.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`lane server for ${name} exited with code ${code} before it listened`));
    });
  });
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
