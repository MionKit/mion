/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Vitest globalSetup of the bundled and mixed lanes: one forked test server per lane, built from THAT lane's
// program (the batch source its resolver compiles into). Not vitest's main process: the router's registries are
// process-wide and the fetched lane already holds them. Not the worker: it would share the caches the specs wipe.
import {fileURLToPath} from 'node:url';
import type {TestProject} from 'vitest/node';
import {forkServer, type ServerProcess} from './serverProcess.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Base URL of this lane's own test server (see test/lib/laneServer.ts). */
    laneServerBaseURL: string;
  }
}

let server: ServerProcess | undefined;

export async function setup(project: TestProject): Promise<void> {
  const configFile = project.vite.config.configFile;
  if (!configFile) throw new Error(`lane server: project ${project.name} has no config file to start the server from`);
  const entry = fileURLToPath(new URL('../../../test-server/src/test-server.ts', import.meta.url));
  // vitest never runs teardown for a globalSetup that threw, so forkServer kills a fork that failed to start
  server = await forkServer(`lane server for ${project.name}`, [
    '--config',
    configFile,
    '--entry',
    entry,
    '--start',
    'startTestServer',
  ]);
  project.provide('laneServerBaseURL', `http://localhost:${server.port}`);
}

export async function teardown(): Promise<void> {
  const closing = server;
  server = undefined;
  await closing?.stop();
}
