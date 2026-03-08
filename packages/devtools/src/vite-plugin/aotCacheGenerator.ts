/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {fork, ChildProcess} from 'child_process';
import {writeFileSync, mkdirSync} from 'fs';
import {resolve, dirname, join} from 'path';
import {AOTCacheOptions} from './types.ts';
import {resolveModule} from './resolveModule.ts';

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

        /** Cleanup child process: disconnect IPC, kill, and clear timeout */
        const cleanup = () => {
            clearTimeout(timeoutId);
            if (child.connected) child.disconnect();
            child.kill();
        };

        child.on('message', (msg: unknown) => {
            const message = msg as AOTCacheMessage;
            if (message?.type === 'mion-aot-caches') {
                resolved = true;
                cleanup();
                resolvePromise({
                    jitFnsCode: message.jitFnsCode,
                    pureFnsCode: message.pureFnsCode,
                    routerCacheCode: message.routerCacheCode,
                });
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

/** Generates a no-op combined module that exports empty caches. */
export function generateNoopCombinedModule(): string {
    return `/* No-op: AOT caches not generated */
export const jitFnsCache = {};
export const pureFnsCache = {};
export const routerCache = {};
`;
}

// ============ Write to Disk ============

const DEFAULT_DISK_PREFIX = 'client-aot-';

/** Writes AOT cache modules to disk as ESM, CJS, and .d.ts files. */
export function writeAOTCachesToDisk(data: AOTCacheData, outDir: string, prefix?: string): void {
    const p = prefix ?? DEFAULT_DISK_PREFIX;
    const esmDir = join(outDir, 'esm');
    const cjsDir = join(outDir, 'cjs');
    mkdirSync(esmDir, {recursive: true});
    mkdirSync(cjsDir, {recursive: true});

    // --- ESM modules ---
    writeFileSync(join(esmDir, `${p}jit-fns.js`), generateJitFnsModule(data.jitFnsCode));
    writeFileSync(join(esmDir, `${p}pure-fns.js`), generatePureFnsModule(data.pureFnsCode));
    writeFileSync(join(esmDir, `${p}router-cache.js`), generateRouterCacheModule(data.routerCacheCode));
    writeFileSync(join(esmDir, 'index.js'), generateDiskCombinedModule(p));

    // --- CJS modules ---
    writeFileSync(join(cjsDir, `${p}jit-fns.cjs`), generateCjsModule('jitFnsCache', data.jitFnsCode));
    writeFileSync(join(cjsDir, `${p}pure-fns.cjs`), generateCjsModule('pureFnsCache', data.pureFnsCode));
    writeFileSync(join(cjsDir, `${p}router-cache.cjs`), generateCjsModule('routerCache', data.routerCacheCode));
    writeFileSync(join(cjsDir, 'index.cjs'), generateCjsCombinedModule(p));
    writeFileSync(join(cjsDir, 'package.json'), '{"type": "commonjs"}\n');

    // --- Type declarations ---
    const jitDts = `import type { PersistedJitFunctionsCache } from '@mionjs/core';\nexport declare const jitFnsCache: PersistedJitFunctionsCache;\n`;
    const pureDts = `import type { PersistedPureFunctionsCache } from '@mionjs/core';\nexport declare const pureFnsCache: PersistedPureFunctionsCache;\n`;
    const routerDts = `import type { MethodsCache } from '@mionjs/core';\nexport declare const routerCache: MethodsCache;\n`;
    const indexDts = `export declare function loadClientAotCaches(): void;\nexport { jitFnsCache } from './${p}jit-fns.js';\nexport { pureFnsCache } from './${p}pure-fns.js';\nexport { routerCache } from './${p}router-cache.js';\n`;

    writeFileSync(join(esmDir, `${p}jit-fns.d.ts`), jitDts);
    writeFileSync(join(esmDir, `${p}pure-fns.d.ts`), pureDts);
    writeFileSync(join(esmDir, `${p}router-cache.d.ts`), routerDts);
    writeFileSync(join(esmDir, 'index.d.ts'), indexDts);
    writeFileSync(join(cjsDir, `${p}jit-fns.d.ts`), jitDts);
    writeFileSync(join(cjsDir, `${p}pure-fns.d.ts`), pureDts);
    writeFileSync(join(cjsDir, `${p}router-cache.d.ts`), routerDts);
    writeFileSync(join(cjsDir, 'index.d.ts'), indexDts);

    console.log(`[mion] AOT cache files written to ${outDir}`);
}

/** Generates a combined ESM entry module that imports from prefixed disk files. */
function generateDiskCombinedModule(prefix: string): string {
    return `/* Auto-generated combined AOT caches - do not edit */
import { addAOTCaches, addRoutesToCache } from '@mionjs/core';
import { jitFnsCache } from './${prefix}jit-fns.js';
import { pureFnsCache } from './${prefix}pure-fns.js';
import { routerCache } from './${prefix}router-cache.js';

export function loadClientAotCaches() {
    addAOTCaches(jitFnsCache, pureFnsCache);
    addRoutesToCache(routerCache);
}

export { jitFnsCache, pureFnsCache, routerCache };
`;
}

/** Generates a CJS module exporting a single named cache. */
function generateCjsModule(exportName: string, code: string): string {
    return `/* Auto-generated AOT cache - do not edit */\nconst ${exportName} = ${code};\nmodule.exports = { ${exportName} };\n`;
}

/** Generates a combined CJS entry module that requires from prefixed disk files. */
function generateCjsCombinedModule(prefix: string): string {
    return `/* Auto-generated combined AOT caches - do not edit */
const { addAOTCaches, addRoutesToCache } = require('@mionjs/core');
const { jitFnsCache } = require('./${prefix}jit-fns.cjs');
const { pureFnsCache } = require('./${prefix}pure-fns.cjs');
const { routerCache } = require('./${prefix}router-cache.cjs');

function loadClientAotCaches() {
    addAOTCaches(jitFnsCache, pureFnsCache);
    addRoutesToCache(routerCache);
}

module.exports = { loadClientAotCaches, jitFnsCache, pureFnsCache, routerCache };
`;
}
