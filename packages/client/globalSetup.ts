/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {RUNTYPES_HALVES} from '../../scripts/lib/vitest-clean-gendir.ts';

/** Port used by client tests - the mion vite plugin spawns the test server on this port */
export const TEST_SERVER_PORT = 8086;
export const TEST_SERVER_BASE_URL = `http://localhost:${TEST_SERVER_PORT}`;

/**
 * Vitest globalSetup — waits until the managed test server (spawned by mionVitePlugin's
 * `server` option) accepts connections. Polls the port directly instead of awaiting the
 * plugin's serverReady export: globalSetup files resolve packages under the `source`
 * condition, so they can get a DIFFERENT module instance than the one the vitest config
 * used (whose serverReady promise would then never resolve here).
 */
export async function setup(): Promise<void> {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${TEST_SERVER_PORT}/`, {method: 'GET'});
      return; // any response means the server is listening
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`mion test server did not accept connections on port ${TEST_SERVER_PORT} within 60s`);
}

/** What this run leaves in the managed server's genDir and must take away again: the RunTypes
 *  halves its build wrote there, plus `rpc/`, the batch module THIS client run wrote into the
 *  server root. That module imports its inline mappers from the client's own `.mion/types/pf/`
 *  tree by absolute path, and the shared vitest-clean-gendir teardown removes that tree, so a
 *  module left behind dangles: the next build importing it (the platform adapters bundling the
 *  edge test server) fails on unresolved imports. */
export const SERVER_GEN_LEFTOVERS = [...RUNTYPES_HALVES, 'rpc'];

/** Removes every leftover of a client run from a server genDir, leaving anything else alone. */
export async function sweepServerGenDir(serverGenDir: string): Promise<void> {
  await Promise.all(SERVER_GEN_LEFTOVERS.map((name) => rm(resolve(serverGenDir, name), {recursive: true, force: true})));
}

/** The managed test server runs with test-server's own vite config, so its genDir lands in THAT
 *  package (this package's own .mion is handled by the shared vitest-clean-gendir teardown); safe
 *  because all project teardowns run after the whole run. */
export async function teardown(): Promise<void> {
  const here = fileURLToPath(new URL('.', import.meta.url));
  await sweepServerGenDir(resolve(here, '../test-server/.mion'));
}
