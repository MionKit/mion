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
// serverChild.mjs, which opens a vite server over the lane's own config, imports the test-server
// entry through it and listens on a free port; the port reaches the specs through vitest's provide /
// inject.
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
