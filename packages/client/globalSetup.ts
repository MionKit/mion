/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Port used by client tests - the mion vite plugin (IPC mode) starts the test server on this port */
export const TEST_SERVER_PORT = 8086;
export const TEST_SERVER_BASE_URL = `http://localhost:${TEST_SERVER_PORT}`;

/** Wait for the IPC-managed server to be ready by polling */
async function waitForServer(port: number, timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 200;

    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(`http://localhost:${port}/`);
            if (response.ok || response.status === 404) return;
        } catch {
            // Server not ready yet
        }
        await new Promise((r) => setTimeout(r, checkInterval));
    }

    throw new Error(`Server failed to become ready on port ${port} within ${timeoutMs}ms`);
}

/** Vitest globalSetup - waits for the IPC-managed test server to be ready */
export async function setup(): Promise<void> {
    console.log(`\nWaiting for test server on port ${TEST_SERVER_PORT}...`);
    await waitForServer(TEST_SERVER_PORT);
    console.log(`Test server ready on port ${TEST_SERVER_PORT}\n`);
}
