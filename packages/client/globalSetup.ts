/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// By relative path, not by package name: globalSetup is loaded through vite's SSR module runner,
// which resolves `@mionjs/test-server` without the `source` export condition the specs get and so
// lands on the unbuilt `.dist` entry. The path names the same module the specs' types come from.
import {startTestServer} from '../test-server/src/test-server.ts';
import type {Server} from 'node:http';

/** Port the in-process test server listens on for the client tests. */
export const TEST_SERVER_PORT = 8086;
export const TEST_SERVER_BASE_URL = `http://localhost:${TEST_SERVER_PORT}`;

let server: Server | undefined;

/**
 * Vitest globalSetup — starts the mion test server IN THIS PROCESS.
 *
 * One program: vitest imports this file through the project's own vite module runner, so the
 * server entry it pulls in is transformed by the same mion plugin the tests are, against the same
 * resolver. Nothing is spawned and no port is polled — `startTestServer` resolves once the socket
 * is listening.
 */
export async function setup(): Promise<void> {
  server = (await startTestServer(TEST_SERVER_PORT)) as Server;
}

/** Closes the server so vitest can exit; the generated trees are swept by vitest-clean-gendir. */
export async function teardown(): Promise<void> {
  if (!server) return;
  await new Promise<void>((done, fail) => server?.close((err) => (err ? fail(err) : done())));
  server = undefined;
}
