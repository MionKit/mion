/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {spawn, ChildProcess} from 'child_process';
import {resolve} from 'path';

/** Port used by client tests - single shared server instance */
export const TEST_SERVER_PORT = 8086;
export const TEST_SERVER_BASE_URL = `http://localhost:${TEST_SERVER_PORT}`;

let serverProcess: ChildProcess | null = null;

/** Wait for server to be ready by polling */
async function waitForServer(port: number, timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 200;

    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(`http://localhost:${port}/`);
            if (response.ok || response.status === 404) {
                return;
            }
        } catch {
            // Server not ready yet
        }
        await new Promise((r) => setTimeout(r, checkInterval));
    }

    throw new Error(`Server failed to start on port ${port} within ${timeoutMs}ms`);
}

/** Kill any process using the specified port */
async function killProcessOnPort(port: number): Promise<void> {
    try {
        const {exec} = await import('child_process');
        const {promisify} = await import('util');
        const execAsync = promisify(exec);
        await execAsync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`);
        await new Promise((r) => setTimeout(r, 500));
    } catch {
        // Ignore errors
    }
}

/** Start a test server process */
async function startServerProcess(port: number, serverScript: string, label: string): Promise<ChildProcess> {
    const testServerPackage = resolve(__dirname, '../test-server');
    const viteConfig = resolve(testServerPackage, 'vite.config.ts');

    const proc = spawn('npx', ['vite-node', '--config', viteConfig, serverScript, port.toString()], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: testServerPackage,
        env: {...process.env, MION_TEST_SERVER_AUTO_START: 'true'},
        detached: true,
    });

    proc.stdout?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[${label}] ${msg}`);
    });

    proc.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.error(`[${label} ERROR] ${msg}`);
    });

    proc.on('error', (error) => {
        console.error(`[${label}] Failed to start:`, error);
    });

    return proc;
}

/** Stop a server process */
async function stopServer(proc: ChildProcess | null, port: number): Promise<void> {
    if (proc && !proc.killed) {
        const pid = proc.pid;

        if (pid) {
            try {
                process.kill(-pid, 'SIGTERM');
            } catch {
                proc.kill('SIGTERM');
            }
        } else {
            proc.kill('SIGTERM');
        }

        await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
                if (proc && !proc.killed) {
                    if (pid) {
                        try {
                            process.kill(-pid, 'SIGKILL');
                        } catch {
                            proc.kill('SIGKILL');
                        }
                    } else {
                        proc.kill('SIGKILL');
                    }
                }
                resolve();
            }, 5000);

            proc!.on('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }

    await killProcessOnPort(port);
}

/** Vitest globalSetup - starts the test server before all tests */
export async function setup(): Promise<() => Promise<void>> {
    const testServerPackage = resolve(__dirname, '../test-server');
    const serverScript = resolve(testServerPackage, 'src/test-server.ts');

    console.log(`\n🚀 Starting test server...`);

    // Clean up any existing processes
    await killProcessOnPort(TEST_SERVER_PORT);

    // Start the server (serves both JSON and binary routes)
    serverProcess = await startServerProcess(TEST_SERVER_PORT, serverScript, 'TEST-SERVER');

    // Wait for server to be ready
    try {
        await waitForServer(TEST_SERVER_PORT);
        console.log(`✅ Test server ready on port ${TEST_SERVER_PORT}\n`);
    } catch (error) {
        await stopServer(serverProcess, TEST_SERVER_PORT);
        throw error;
    }

    // Return teardown function
    return async () => {
        console.log(`\n🛑 Stopping test server...`);
        await stopServer(serverProcess, TEST_SERVER_PORT);
        console.log('✅ Test server stopped\n');
    };
}
