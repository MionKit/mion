/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {spawn, ChildProcess, exec} from 'child_process';
import {join, resolve} from 'path';
import {promisify} from 'util';

const execAsync = promisify(exec);

/**
 * Port mapping for different test files to avoid conflicts when running in parallel
 * Each test file should use a unique port from this mapping
 * NOTE: Port 8076 is used by http package tests, so we use 8086+ for client tests
 */
export const TEST_PORT_MAPPING = {
    client: 8086,
    clientMethodsMetadata: 8087,
    // Add more test files here as needed
    // 'anotherTest.spec.ts': 8088,
} as const;

/**
 * Jest timeout constants for test hooks
 * These should be longer than the server startup/shutdown timeouts to account for Jest overhead
 */
export const JEST_TIMEOUT_CONSTANTS = {
    /** Timeout for beforeAll hooks that start servers (should be > server startup timeout + buffer) */
    BEFORE_ALL_TIMEOUT: 30000, // 30 seconds
    /** Timeout for afterAll hooks that stop servers (should be > server shutdown timeout + buffer) */
    AFTER_ALL_TIMEOUT: 10000, // 10 seconds
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
    /** Timeout in milliseconds to wait for server startup (default: 30000) */
    startupTimeout?: number;
    /** Timeout in milliseconds to wait for server shutdown (default: 8000) */
    shutdownTimeout?: number;
    /** Whether to log server output to console (default: false) */
    logOutput?: boolean;
    /** Maximum number of startup retry attempts (default: 3) */
    maxStartupRetries?: number;
    /** Whether to use HTTP health checks instead of stdout parsing (default: true) */
    useHealthCheck?: boolean;
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
            startupTimeout: JEST_TIMEOUT_CONSTANTS.BEFORE_ALL_TIMEOUT - 500,
            shutdownTimeout: JEST_TIMEOUT_CONSTANTS.AFTER_ALL_TIMEOUT - 500,
            logOutput: false,
            maxStartupRetries: 3,
            useHealthCheck: true,
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

        let lastError: Error | null = null;

        // Retry startup logic
        for (let attempt = 1; attempt <= this.options.maxStartupRetries!; attempt++) {
            try {
                if (this.options.logOutput) {
                    console.log(
                        `Starting test server on port ${this.availablePort} (attempt ${attempt}/${this.options.maxStartupRetries})`
                    );
                }

                // Kill any existing processes on this port before starting
                await killProcessOnPort(this.availablePort);

                // Add a delay to ensure the port is fully released
                await new Promise((resolve) => setTimeout(resolve, 500));

                // Start the server process
                await this.startServerProcess();

                // Wait for server to be ready using the configured method
                if (this.options.useHealthCheck) {
                    await this.waitForServerWithHealthCheck();
                } else {
                    await this.waitForServerWithStdout();
                }

                // Server started successfully
                if (this.options.logOutput) {
                    console.log(`Test server started successfully on port ${this.availablePort}`);
                }
                return;
            } catch (error) {
                lastError = error as Error;

                if (this.options.logOutput) {
                    console.log(`Server startup attempt ${attempt} failed:`, error);
                }

                // Clean up failed process
                if (this.serverProcess && !(this.serverProcess as ChildProcess).killed) {
                    try {
                        (this.serverProcess as ChildProcess).kill('SIGKILL');
                    } catch {
                        // Ignore cleanup errors
                    }
                }
                this.serverProcess = null;

                // Wait before retrying (exponential backoff)
                if (attempt < this.options.maxStartupRetries!) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }
        }

        // All attempts failed
        throw new Error(
            `Failed to start server after ${this.options.maxStartupRetries} attempts. Last error: ${lastError?.message}`
        );
    }

    /**
     * Start the server process
     */
    private async startServerProcess(): Promise<void> {
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

        // Always pipe output to console for debugging
        if (this.serverProcess.stdout) {
            this.serverProcess.stdout.on('data', (data) => {
                process.stdout.write(`[SERVER] ${data}`);
            });
        }

        if (this.serverProcess.stderr) {
            this.serverProcess.stderr.on('data', (data) => {
                process.stderr.write(`[SERVER ERROR] ${data}`);
            });
        }

        // Set up basic error handling
        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Server process failed to start within 5 seconds'));
            }, 5000);

            this.serverProcess!.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });

            this.serverProcess!.on('spawn', () => {
                clearTimeout(timeout);
                resolve();
            });

            // Handle immediate exit
            this.serverProcess!.on('exit', (code) => {
                if (code !== 0) {
                    clearTimeout(timeout);
                    reject(new Error(`Server process exited immediately with code ${code}`));
                }
            });
        });
    }

    /**
     * Wait for server to be ready using HTTP health checks
     */
    private async waitForServerWithHealthCheck(): Promise<void> {
        const startTime = Date.now();
        const maxWaitTime = this.options.startupTimeout!;

        while (Date.now() - startTime < maxWaitTime) {
            // Check if process is still running
            if (!this.serverProcess || this.serverProcess.killed) {
                throw new Error('Server process died while waiting for health check');
            }

            // Try health check
            const isHealthy = await healthCheck(this.availablePort, 1, 100);
            if (isHealthy) {
                return; // Server is ready
            }

            // Wait before next check
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        throw new Error(`Server health check timeout after ${maxWaitTime}ms`);
    }

    /**
     * Wait for server to be ready using stdout parsing (fallback method)
     */
    private async waitForServerWithStdout(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Server startup timeout after ${this.options.startupTimeout}ms`));
            }, this.options.startupTimeout);

            this.serverProcess!.stdout?.on('data', (data) => {
                const output = data.toString();
                if (this.options.logOutput) {
                    console.log('Server stdout:', output);
                }
                // Look for either "Test server started" or "mion node server running"
                if (output.includes('Test server started') || output.includes('mion node server running')) {
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

        if (this.options.logOutput) {
            console.log(`Stopping test server on port ${this.availablePort}...`);
        }

        try {
            // Send SIGTERM first for graceful shutdown
            this.serverProcess.kill('SIGTERM');

            // Wait for process to exit gracefully
            await new Promise<void>((resolve) => {
                let resolved = false;
                let forceKillTimeout: NodeJS.Timeout | null = null;

                const cleanup = () => {
                    if (!resolved) {
                        resolved = true;

                        // Clear the force kill timeout if it exists
                        if (forceKillTimeout) {
                            clearTimeout(forceKillTimeout);
                            forceKillTimeout = null;
                        }

                        resolve();
                    }
                };

                this.serverProcess!.on('exit', cleanup);
                this.serverProcess!.on('close', cleanup);

                // Force kill after timeout if it doesn't exit gracefully
                forceKillTimeout = setTimeout(() => {
                    if (!resolved && this.serverProcess && !this.serverProcess.killed) {
                        if (this.options.logOutput) {
                            console.log(`Force killing test server after ${this.options.shutdownTimeout}ms timeout`);
                        }
                        this.serverProcess.kill('SIGKILL');

                        // Give SIGKILL a moment to work
                        setTimeout(cleanup, 1000);
                    } else {
                        cleanup();
                    }
                }, this.options.shutdownTimeout);
            });
        } finally {
            // Always clean up resources, even if stopping failed
            this.cleanupServerProcess();

            // Ensure port is fully released
            await killProcessOnPort(this.availablePort, 2);

            // Add a delay to ensure the port is fully released
            await new Promise((resolve) => setTimeout(resolve, 500));

            if (this.options.logOutput) {
                console.log(`Test server stopped on port ${this.availablePort}`);
            }
        }
    }

    /**
     * Clean up server process resources
     */
    private cleanupServerProcess(): void {
        if (this.serverProcess) {
            try {
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
            } catch (error) {
                // Ignore cleanup errors
                if (this.options.logOutput) {
                    console.warn('Error during process cleanup:', error);
                }
            } finally {
                this.serverProcess = null;
            }
        }
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
            try {
                await serverManager.stop();
            } catch (error) {
                console.warn(`Warning: Error stopping test server on port ${options.port}:`, error);
                // Don't throw to avoid failing tests due to cleanup issues
            }
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

/**
 * Perform HTTP health check to verify server is responding
 */
async function healthCheck(port: number, maxRetries: number = 5, retryDelay: number = 500): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            // Use fetch to check if server is responding
            const response = await fetch(`http://localhost:${port}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(2000), // 2 second timeout per request
            });

            // Accept any response (even 404) as long as server is responding
            if (response.status >= 200 && response.status < 600) {
                return true;
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            // Server not responding yet, continue retrying
        }

        if (i < maxRetries - 1) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
    }

    return false;
}

/**
 * Check if a port is in use and kill any processes using it
 */
async function killProcessOnPort(port: number, maxRetries: number = 3): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Use lsof to find processes using the port
            const {stdout} = await execAsync(`lsof -ti :${port}`);
            const pids = stdout
                .trim()
                .split('\n')
                .filter((pid) => pid);

            if (pids.length === 0) {
                // No processes found, port is free
                return;
            }

            console.log(
                `Found ${pids.length} process(es) on port ${port}, killing them... (attempt ${attempt + 1}/${maxRetries})`
            );

            // Kill each process
            for (const pid of pids) {
                try {
                    // Try SIGTERM first, then SIGKILL if needed
                    await execAsync(`kill -TERM ${pid}`);

                    // Wait longer for graceful shutdown under load
                    await new Promise((resolve) => setTimeout(resolve, 2000));

                    // Check if process is still running
                    try {
                        await execAsync(`kill -0 ${pid}`);
                        // Process still running, force kill
                        console.log(`Process ${pid} didn't respond to SIGTERM, using SIGKILL`);
                        await execAsync(`kill -KILL ${pid}`);
                        // Wait for force kill to take effect
                        await new Promise((resolve) => setTimeout(resolve, 1000));
                    } catch {
                        // Process already dead, which is what we want
                    }
                } catch (error) {
                    // Process might already be dead or we don't have permission
                    console.log(`Could not kill process ${pid}:`, error);
                }
            }

            // Wait longer for port to be released under load
            await new Promise((resolve) => setTimeout(resolve, 1500));

            // Verify port is actually free by checking again
            try {
                const {stdout: checkStdout} = await execAsync(`lsof -ti :${port}`);
                const remainingPids = checkStdout
                    .trim()
                    .split('\n')
                    .filter((pid) => pid);
                if (remainingPids.length === 0) {
                    // Port is now free
                    return;
                }
                // Still processes on port, will retry
                console.log(`Port ${port} still has ${remainingPids.length} process(es), retrying...`);
            } catch {
                // lsof failed, assume port is free
                return;
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            // lsof command failed, probably no processes on port (which is good)
            // or lsof is not available
            return;
        }
    }

    // Final attempt to verify port is free
    console.warn(`Warning: Could not fully clean port ${port} after ${maxRetries} attempts`);
}
