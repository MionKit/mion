/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {startTestServer} from './src/server/server.ts';
import type {Server} from 'node:http';

/** Port the in-process mion server listens on for this lane. */
export const TEST_SERVER_PORT = 8086;

let server: Server | undefined;

/** Vitest globalSetup — starts the mion API in THIS process, transformed by the same published
 *  plugin the specs are. Nothing is spawned and no port is polled. */
export async function setup(): Promise<void> {
    server = (await startTestServer(TEST_SERVER_PORT)) as Server;
}

export async function teardown(): Promise<void> {
    if (!server) return;
    await new Promise<void>((done) => server?.close(() => done()));
    server = undefined;
}
