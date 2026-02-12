/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {spawn, ChildProcess} from 'child_process';
import {resolve} from 'path';

/** Ports used by client tests - shared server instances */
export const TEST_SERVER_PORT_JSON = 8086;
export const TEST_SERVER_PORT_BINARY = 8087;
export const TEST_SERVER_BASE_URL_JSON = `http://localhost:${TEST_SERVER_PORT_JSON}`;
export const TEST_SERVER_BASE_URL_BINARY = `http://localhost:${TEST_SERVER_PORT_BINARY}`;

let jsonServerProcess: ChildProcess | null = null;
let binaryServerProcess: ChildProcess | null = null;

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
async function startServer(port: number, serverScript: string, label: string): Promise<ChildProcess> {
    const testServerPackage = resolve(__dirname, '../test-server');
    const viteConfig = resolve(testServerPackage, 'vite.config.ts');

    const serverProcess = spawn('npx', ['vite-node', '--config', viteConfig, serverScript, port.toString()], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: testServerPackage,
        env: {...process.env, MION_TEST_SERVER_AUTO_START: 'true'},
        detached: true,
    });

    serverProcess.stdout?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[${label}] ${msg}`);
    });

    serverProcess.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.error(`[${label} ERROR] ${msg}`);
    });

    serverProcess.on('error', (error) => {
        console.error(`[${label}] Failed to start:`, error);
    });

    return serverProcess;
}

/** Stop a server process */
async function stopServer(serverProcess: ChildProcess | null, port: number): Promise<void> {
    if (serverProcess && !serverProcess.killed) {
        const pid = serverProcess.pid;

        if (pid) {
            try {
                process.kill(-pid, 'SIGTERM');
            } catch {
                serverProcess.kill('SIGTERM');
            }
        } else {
            serverProcess.kill('SIGTERM');
        }

        await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
                if (serverProcess && !serverProcess.killed) {
                    if (pid) {
                        try {
                            process.kill(-pid, 'SIGKILL');
                        } catch {
                            serverProcess.kill('SIGKILL');
                        }
                    } else {
                        serverProcess.kill('SIGKILL');
                    }
                }
                resolve();
            }, 5000);

            serverProcess!.on('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }

    await killProcessOnPort(port);
}

/** Vitest globalSetup - starts test servers before all tests */
export async function setup(): Promise<() => Promise<void>> {
    const testServerPackage = resolve(__dirname, '../test-server');
    const jsonScript = resolve(testServerPackage, 'src/test-server-json.ts');
    const binaryScript = resolve(testServerPackage, 'src/test-server-binary.ts');

    console.log(`\n🚀 Starting test servers...`);

    // Clean up any existing processes
    await Promise.all([killProcessOnPort(TEST_SERVER_PORT_JSON), killProcessOnPort(TEST_SERVER_PORT_BINARY)]);

    // Start both servers
    jsonServerProcess = await startServer(TEST_SERVER_PORT_JSON, jsonScript, 'JSON-SERVER');
    binaryServerProcess = await startServer(TEST_SERVER_PORT_BINARY, binaryScript, 'BINARY-SERVER');

    // Wait for both servers to be ready
    try {
        await Promise.all([waitForServer(TEST_SERVER_PORT_JSON), waitForServer(TEST_SERVER_PORT_BINARY)]);
        console.log(`✅ JSON server ready on port ${TEST_SERVER_PORT_JSON}`);
        console.log(`✅ Binary server ready on port ${TEST_SERVER_PORT_BINARY}\n`);
    } catch (error) {
        // Kill processes if startup failed
        await Promise.all([
            stopServer(jsonServerProcess, TEST_SERVER_PORT_JSON),
            stopServer(binaryServerProcess, TEST_SERVER_PORT_BINARY),
        ]);
        throw error;
    }

    // Return teardown function
    return async () => {
        console.log(`\n🛑 Stopping test servers...`);

        await Promise.all([
            stopServer(jsonServerProcess, TEST_SERVER_PORT_JSON),
            stopServer(binaryServerProcess, TEST_SERVER_PORT_BINARY),
        ]);

        console.log('✅ Test servers stopped\n');
    };
}
