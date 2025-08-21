/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {spawn, ChildProcess} from 'child_process';
import {join, resolve} from 'path';

/**
 * Port mapping for different test files to avoid conflicts when running in parallel
 * Each test file should use a unique port from this mapping
 */
export const TEST_PORT_MAPPING = {
    'client.spec.ts': 8076,
    'clientMethodsMetadata.spec.ts': 8077,
    // Add more test files here as needed
    // 'anotherTest.spec.ts': 8078,
} as const;

/**
 * Get the absolute path to the client package directory
 * This file is in packages/client/test/test-server-utils.ts
 * So we need to go up one level to get to packages/client/
 */
function getClientPackageRoot(): string {
    return resolve(__dirname, '..');
}

/**
 * Configuration options for starting a test server
 */
export interface TestServerOptions {
    /** Port number for the server */
    port: number;
    /** Timeout in milliseconds to wait for server startup (default: 10000) */
    startupTimeout?: number;
    /** Timeout in milliseconds to wait for server shutdown (default: 1000) */
    shutdownTimeout?: number;
    /** Whether to log server output to console (default: false) */
    logOutput?: boolean;
}

/**
 * Utility class for managing test server lifecycle
 */
export class TestServerManager {
    private serverProcess: ChildProcess | null = null;
    private options: Required<TestServerOptions>;
    private availablePort: number;

    constructor(options: TestServerOptions) {
        this.options = {
            startupTimeout: 10000,
            shutdownTimeout: 1000,
            logOutput: false,
            ...options,
        };
        this.availablePort = options.port; // Will be updated to actual port during start()
    }

    /**
     * Start the test server in a separate process
     */
    async start(): Promise<void> {
        if (this.serverProcess) {
            throw new Error('Server is already running');
        }

        // Use the requested port directly (no dynamic port finding)
        // Tests should use unique ports from TEST_PORT_MAPPING to avoid conflicts
        this.availablePort = this.options.port;

        // Get the client package root for the script paths
        const clientPackageRoot = getClientPackageRoot();
        const tsconfigPath = join(clientPackageRoot, 'test', 'tsconfig.json');
        const serverScriptPath = join(clientPackageRoot, 'test', 'test-server.ts');

        // Start the server in a separate process using ts-node
        // Use process.cwd() as working directory so it works from wherever Jest is run
        this.serverProcess = spawn(
            'npx',
            ['ts-node', '--project', tsconfigPath, serverScriptPath, this.availablePort.toString()],
            {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: process.cwd(), // Use current working directory where Jest is run from
            }
        );

        // Wait for server to start
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Server startup timeout after ${this.options.startupTimeout}ms`));
            }, this.options.startupTimeout);

            this.serverProcess!.stdout?.on('data', (data) => {
                const output = data.toString();
                if (this.options.logOutput) {
                    console.log('Server stdout:', output);
                }
                if (output.includes('Test server started')) {
                    clearTimeout(timeout);
                    resolve();
                }
            });

            this.serverProcess!.stderr?.on('data', (data) => {
                const output = data.toString();
                if (this.options.logOutput) {
                    console.error('Server stderr:', output);
                }
            });

            this.serverProcess!.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });

            this.serverProcess!.on('exit', (code) => {
                if (code !== 0) {
                    clearTimeout(timeout);
                    reject(new Error(`Server process exited with code ${code}`));
                }
            });
        });
    }

    /**
     * Stop the test server and clean up resources
     */
    async stop(): Promise<void> {
        if (!this.serverProcess || this.serverProcess.killed) {
            return;
        }

        // Send SIGINT which the HTTP package handles gracefully
        // Do this BEFORE removing listeners so the server can respond to the signal
        this.serverProcess.kill('SIGINT');

        // Wait for process to exit gracefully
        await new Promise<void>((resolve) => {
            let resolved = false;

            const cleanup = () => {
                if (!resolved) {
                    resolved = true;

                    // Clean up resources after the process has exited
                    if (this.serverProcess) {
                        // Remove all listeners to prevent memory leaks
                        this.serverProcess.removeAllListeners();

                        // Clean up stdio streams
                        if (this.serverProcess.stdout) {
                            this.serverProcess.stdout.removeAllListeners();
                            this.serverProcess.stdout.destroy();
                        }
                        if (this.serverProcess.stderr) {
                            this.serverProcess.stderr.removeAllListeners();
                            this.serverProcess.stderr.destroy();
                        }
                        if (this.serverProcess.stdin) {
                            this.serverProcess.stdin.removeAllListeners();
                            this.serverProcess.stdin.destroy();
                        }

                        this.serverProcess = null;
                    }

                    resolve();
                }
            };

            this.serverProcess!.on('exit', cleanup);
            this.serverProcess!.on('close', cleanup);

            // Force kill after timeout if it doesn't exit gracefully
            setTimeout(() => {
                if (!resolved && this.serverProcess && !this.serverProcess.killed) {
                    this.serverProcess.kill('SIGKILL');
                }
                cleanup();
            }, this.options.shutdownTimeout);
        });
    }

    /**
     * Get the base URL for the running server
     */
    getBaseURL(): string {
        return `http://localhost:${this.availablePort}`;
    }

    /**
     * Get the actual port the server is running on
     * This may be different from the requested port if that port was in use
     */
    getActualPort(): number {
        return this.availablePort;
    }

    /**
     * Check if the server is currently running
     */
    isRunning(): boolean {
        return this.serverProcess !== null && !this.serverProcess.killed;
    }
}

/**
 * Convenience function to create and start a test server
 */
export async function startTestServer(options: TestServerOptions): Promise<TestServerManager> {
    const manager = new TestServerManager(options);
    await manager.start();
    return manager;
}

/**
 * Convenience function for Jest beforeAll/afterAll hooks
 */
export function createTestServerHooks(options: TestServerOptions) {
    let serverManager: TestServerManager;

    const beforeAll = async () => {
        serverManager = await startTestServer(options);
    };

    const afterAll = async () => {
        if (serverManager) {
            await serverManager.stop();
        }
    };

    const getBaseURL = () => serverManager?.getBaseURL() || `http://localhost:${options.port}`;
    const getActualPort = () => serverManager?.getActualPort() || options.port;

    return {
        beforeAll,
        afterAll,
        getBaseURL,
        getActualPort,
        getManager: () => serverManager,
    };
}
