/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

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
