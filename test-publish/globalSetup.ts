/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {serverReady} from '@mionjs/devtools/vite-plugin';

/** Port used by test-publish tests - the mion vite plugin (IPC mode) starts the server on this port */
export const TEST_SERVER_PORT = 8086;

/** Vitest globalSetup - waits for the mion plugin's serverReady promise */
export async function setup(): Promise<void> {
    await serverReady;
}
