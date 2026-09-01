/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {serverReady} from '@mionjs/devtools/vite';

/** Port the managed mion server listens on — the plugin spawns it via vite-node (childProcess mode). */
export const TEST_SERVER_PORT = 8086;

/** Vitest globalSetup - waits for the mion plugin's serverReady promise */
export async function setup(): Promise<void> {
    await serverReady;
}
