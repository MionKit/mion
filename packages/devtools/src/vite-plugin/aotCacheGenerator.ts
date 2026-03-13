/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {fork, ChildProcess} from 'child_process';
import {resolve, dirname} from 'path';
import {MionServerConfig} from './types.ts';
import {resolveModule} from './resolveModule.ts';

/** AOT cache data returned from the generator */
export interface AOTCacheData {
    jitFnsCode: string;
    pureFnsCode: string;
    routerCacheCode: string;
}

/** AOT cache result including optional persistent child process */
export interface AOTCacheResult {
    data: AOTCacheData;
    /** The child process, only present when server mode is 'IPC' (persist) */
    childProcess?: ChildProcess;
}

/** IPC message type from the router's aotEmitter */
interface AOTCacheMessage {
    type: 'mion-aot-caches';
    jitFnsCode: string;
    pureFnsCode: string;
    routerCacheCode: string;
}

/** Default timeout for AOT cache generation (30 seconds) */
const DEFAULT_TIMEOUT = 30000;

/**
 * Generates AOT caches by spawning vite-node to run the server's start script.
 *
 * vite-node is used instead of plain node/ts-node because:
 * 1. The server needs deepkit type compiler transformations
 * 2. The server's vite.config.ts has aliases and plugins that must be applied
 * 3. vite-node provides the same environment as the actual server build
 *
 * The router's emitAOTCaches() (called automatically from initMionRouter)
 * detects MION_COMPILE and sends the serialized caches via IPC.
 */
export async function generateAOTCaches(serverConfig: MionServerConfig, startScriptOverride?: string): Promise<AOTCacheResult> {
    const persist = serverConfig.mode === 'IPC';
    const startScript = resolve(startScriptOverride ?? serverConfig.startServerScript);
    const scriptDir = dirname(startScript);

    // Determine the vite config to use
    // If serverViteConfig is provided, use it; otherwise let vite-node auto-discover
    const viteConfigArgs = serverConfig.serverViteConfig ? ['--config', resolve(serverConfig.serverViteConfig)] : [];

    // Resolve vite-node path in both CJS and ESM environments
    let viteNodePath: string;
    try {
        viteNodePath = await resolveModule('vite-node/cli', scriptDir);
    } catch (err) {
        throw new Error(
            `Failed to resolve vite-node. Make sure vite-node is installed.\n` +
                `You can install it with: npm install -D vite-node\n` +
                `Original error: ${err instanceof Error ? err.message : String(err)}`
        );
    }

    return new Promise((resolvePromise, reject) => {
        let child: ChildProcess;
        let resolved = false;
        let stderr = '';

        try {
            // Spawn vite-node as a child process with IPC channel
            // 'serve' mode tells platform adapters to proceed with server.listen()
            child = fork(viteNodePath, [...viteConfigArgs, startScript], {
                env: {...process.env, MION_COMPILE: persist ? 'serve' : 'onlyAOT'},
                stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
                cwd: scriptDir,
            });
        } catch (err) {
            // If vite-node is not found, provide a helpful error message
            reject(
                new Error(
                    `Failed to spawn vite-node. Make sure vite-node is installed.\n` +
                        `You can install it with: npm install -D vite-node\n` +
                        `Original error: ${err instanceof Error ? err.message : String(err)}`
                )
            );
            return;
        }

        /** Cleanup child process: disconnect IPC, clear timeout, and optionally kill */
        const cleanup = () => {
            clearTimeout(timeoutId);
            if (child.connected) child.disconnect();
            if (!persist) child.kill();
        };

        child.on('message', (msg: unknown) => {
            const message = msg as AOTCacheMessage;
            if (message?.type === 'mion-aot-caches') {
                resolved = true;
                cleanup();
                resolvePromise({
                    data: {
                        jitFnsCode: message.jitFnsCode,
                        pureFnsCode: message.pureFnsCode,
                        routerCacheCode: message.routerCacheCode,
                    },
                    childProcess: persist ? child : undefined,
                });
            }
        });

        // Capture stderr for error reporting (and pipe through in persist mode)
        child.stderr?.on('data', (data: Buffer) => {
            const msg = data.toString().trim();
            if (!resolved) stderr += msg + '\n';
            if (persist && msg) console.error(`[mion-server] ${msg}`);
        });

        // Pipe stdout through (always in persist mode, only with DEBUG_AOT otherwise)
        child.stdout?.on('data', (data: Buffer) => {
            const msg = data.toString().trim();
            if (persist && msg) {
                console.log(`[mion-server] ${msg}`);
            } else if (process.env.DEBUG_AOT && msg) {
                console.log('[mion-aot] stdout:', msg);
            }
        });

        child.on('error', (err) => {
            if (!resolved) {
                cleanup();
                reject(new Error(`vite-node failed to start: ${err.message}`));
            }
        });

        child.on('exit', (code) => {
            if (!resolved) {
                cleanup();
                reject(
                    new Error(
                        `vite-node exited with code ${code} before emitting AOT caches.\n` +
                            `Make sure the startServerScript calls initMionRouter() and the router ` +
                            `is fully initialized.\n` +
                            (stderr ? `stderr: ${stderr}` : '')
                    )
                );
            }
        });

        // Timeout safety
        const timeoutId = setTimeout(() => {
            if (!resolved) {
                cleanup();
                if (persist) child.kill();
                reject(
                    new Error(
                        `AOT cache generation timed out (${DEFAULT_TIMEOUT / 1000}s). ` +
                            `Make sure the server start script completes initialization.`
                    )
                );
            }
        }, DEFAULT_TIMEOUT);
    });
}

/** Loads a module by URL — abstracts over ssrLoadModule and Environment Runner */
export type ModuleLoader = (url: string) => Promise<Record<string, any>>;

/**
 *  Loads the startServerScript with MION_COMPILE=SSR so platform adapters skip server.listen().
 *  Generates AOT caches via SSR using a module loader (for same-Vite-process scenarios like Nuxt).
 *  After loading, retrieves the caches directly from the router's global state via getSerializedCaches(). */
export async function loadSSRRouterAndGenerateAOTCaches(
    loadModule: ModuleLoader,
    startServerScript: string
): Promise<AOTCacheData> {
    const prevCompile = process.env.MION_COMPILE;
    process.env.MION_COMPILE = 'viteSSR';

    try {
        // Load the start server script — triggers initMionRouter(), populates caches,
        // skips process.send (SSR mode) and skips server.listen() (platform adapters)
        await loadModule(startServerScript);

        // Get caches directly from the router's global state
        const aotModule = await loadModule('@mionjs/router/aot');
        const caches: AOTCacheData = await aotModule.getSerializedCaches();
        return caches;
    } finally {
        if (prevCompile === undefined) delete process.env.MION_COMPILE;
        else process.env.MION_COMPILE = prevCompile;
    }
}

// ============ Persistent child management ============

/** Kills a persistent child process gracefully (SIGTERM then SIGKILL after 5s) */
export async function killPersistentChild(child: ChildProcess | null): Promise<void> {
    if (!child || child.killed) return;
    const pid = child.pid;

    if (pid) {
        try {
            process.kill(-pid, 'SIGTERM');
        } catch {
            child.kill('SIGTERM');
        }
    } else {
        child.kill('SIGTERM');
    }

    await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
            if (child && !child.killed) {
                if (pid) {
                    try {
                        process.kill(-pid, 'SIGKILL');
                    } catch {
                        child.kill('SIGKILL');
                    }
                } else {
                    child.kill('SIGKILL');
                }
            }
            resolve();
        }, 5000);

        child!.on('exit', () => {
            clearTimeout(timeout);
            resolve();
        });
    });
}

// ============ Logging ============

/** Formats byte size to human-readable string */
function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
}

/** Logs AOT cache sizes and optionally full contents in verbose mode (DEBUG_AOT) */
export function logAOTCaches(data: AOTCacheData): void {
    const jitSize = formatBytes(Buffer.byteLength(data.jitFnsCode, 'utf-8'));
    const pureSize = formatBytes(Buffer.byteLength(data.pureFnsCode, 'utf-8'));
    const routerSize = formatBytes(Buffer.byteLength(data.routerCacheCode, 'utf-8'));
    console.log(`[mion]   jitFns: ${jitSize}, pureFns: ${pureSize}, routerCache: ${routerSize}`);

    if (process.env.DEBUG_AOT) {
        console.log('[mion] AOT jitFns cache:\n', data.jitFnsCode);
        console.log('[mion] AOT pureFns cache:\n', data.pureFnsCode);
        console.log('[mion] AOT routerCache:\n', data.routerCacheCode);
    }
}

// ============ Module Generators ============

/** Generates the virtual module code for JIT functions cache (exports only). */
export function generateJitFnsModule(jitFnsCode: string): string {
    return `/* Auto-generated AOT JIT functions cache - do not edit */
export const jitFnsCache = ${jitFnsCode};
`;
}

/** Generates the virtual module code for pure functions cache (exports only). */
export function generatePureFnsModule(pureFnsCode: string): string {
    return `/* Auto-generated AOT pure functions cache - do not edit */
export const pureFnsCache = ${pureFnsCode};
`;
}

/** Generates the virtual module code for router methods cache (exports only). */
export function generateRouterCacheModule(routerCacheCode: string): string {
    return `/* Auto-generated AOT router cache - do not edit */
export const routerCache = ${routerCacheCode};
`;
}

/** Generates the combined virtual module that imports all 3 caches, registers them, and re-exports. */
export function generateCombinedCachesModule(): string {
    return `/* Auto-generated combined AOT caches - do not edit */
import { addAOTCaches, addRoutesToCache } from '@mionjs/core';
import { pureFnsCache } from 'virtual:mion-aot/pure-fns';
import { jitFnsCache } from 'virtual:mion-aot/jit-fns';
import { routerCache } from 'virtual:mion-aot/router-cache';

addAOTCaches(jitFnsCache, pureFnsCache);
addRoutesToCache(routerCache);

export { jitFnsCache, pureFnsCache, routerCache };
`;
}

/** Generates a no-op module for when AOT caches are disabled. */
export function generateNoopModule(comment: string): string {
    return `/* ${comment} */\n`;
}

/** Poll an HTTP port until the server responds (2xx or 404). */
export async function waitForServer(port: number, timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 100;
    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(`http://localhost:${port}/`);
            if (response.ok || response.status === 404) return;
        } catch {
            // Server not ready yet
        }
        await new Promise((r) => setTimeout(r, checkInterval));
    }
    throw new Error(`[mion] Server failed to become ready on port ${port} within ${timeoutMs}ms`);
}

/** Generates a no-op combined module that exports empty caches. */
export function generateNoopCombinedModule(): string {
    return `/* No-op: AOT caches not generated */
export const jitFnsCache = {};
export const pureFnsCache = {};
export const routerCache = {};
`;
}
