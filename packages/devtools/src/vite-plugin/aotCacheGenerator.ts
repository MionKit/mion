/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {fork, ChildProcess} from 'child_process';
import {resolve, dirname} from 'path';
import {AOTCacheOptions} from './types.ts';
import {resolveModule} from '@mionkit/core';

/** AOT cache data returned from the generator */
export interface AOTCacheData {
    jitFnsCode: string;
    pureFnsCode: string;
    routerCacheCode: string;
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
 * detects MION_COMPILE=true and sends the serialized caches via IPC.
 *
 * @param options - AOT cache options
 * @param startScriptOverride - Optional override for the start script path (used for default routes)
 */
export async function generateAOTCaches(options: AOTCacheOptions, startScriptOverride?: string): Promise<AOTCacheData> {
    const startScript = resolve(startScriptOverride ?? options.startServerScript!);
    const scriptDir = dirname(startScript);

    // Determine the vite config to use
    // If serverViteConfig is provided, use it; otherwise let vite-node auto-discover
    const viteConfigArgs = options.serverViteConfig ? ['--config', resolve(options.serverViteConfig)] : [];

    // Resolve vite-node path in both CJS and ESM environments
    let viteNodePath: string;
    try {
        viteNodePath = await resolveModule('vite-node/vite-node.mjs', scriptDir);
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
            child = fork(viteNodePath, [...viteConfigArgs, startScript], {
                env: {...process.env, MION_COMPILE: 'true'},
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

        child.on('message', (msg: unknown) => {
            const message = msg as AOTCacheMessage;
            if (message?.type === 'mion-aot-caches') {
                resolved = true;
                resolvePromise({
                    jitFnsCode: message.jitFnsCode,
                    pureFnsCode: message.pureFnsCode,
                    routerCacheCode: message.routerCacheCode,
                });
                child.kill(); // Clean up after receiving caches
            }
        });

        // Capture stderr for error reporting
        child.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString();
        });

        // Also capture stdout for debugging
        child.stdout?.on('data', (data: Buffer) => {
            // Log to console for debugging during development
            if (process.env.DEBUG_AOT) {
                console.log('[mion-aot] stdout:', data.toString());
            }
        });

        child.on('error', (err) => {
            if (!resolved) {
                reject(new Error(`vite-node failed to start: ${err.message}`));
            }
        });

        child.on('exit', (code) => {
            if (!resolved) {
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
        setTimeout(() => {
            if (!resolved) {
                child.kill();
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

// ============ Module Generators ============

/**
 * Generates the virtual module code for JIT functions + pure functions cache.
 * This module self-registers by calling addAOTCaches() on import.
 */
export function generateJitFnsModule(jitFnsCode: string): string {
    return `/* Auto-generated AOT JIT functions cache - do not edit */
import { addAOTCaches } from '@mionkit/core';

const jitFnsCache = ${jitFnsCode};

addAOTCaches(jitFnsCache, {});
`;
}

/**
 * Generates the virtual module code for pure functions cache (standalone).
 * This module self-registers by calling addAOTCaches() on import.
 */
export function generatePureFnsModule(pureFnsCode: string): string {
    return `/* Auto-generated AOT pure functions cache - do not edit */
import { addAOTCaches } from '@mionkit/core';

const pureFnsCache = ${pureFnsCode};

addAOTCaches({}, pureFnsCache);
`;
}

/**
 * Generates the virtual module code for router methods cache.
 * This module self-registers by calling addRoutesToCache() on import.
 */
export function generateRouterCacheModule(routerCacheCode: string): string {
    return `/* Auto-generated AOT router cache - do not edit */
import { addRoutesToCache } from '@mionkit/core';

const routerCache = ${routerCacheCode};

addRoutesToCache(routerCache);
`;
}

/**
 * Generates a no-op module for when AOT caches are disabled.
 */
export function generateNoopModule(comment: string): string {
    return `/* ${comment} */\n`;
}
