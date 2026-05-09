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

/** True when running under Vitest (or NODE_ENV=test). Used to suppress info logs during tests. */
const IS_TEST_ENV = process.env.VITEST !== undefined || process.env.NODE_ENV === 'test';
/** Info logger — silent in test env. Errors should keep using console.error directly. */
const log: (...args: unknown[]) => void = IS_TEST_ENV ? () => undefined : console.log.bind(console);

/** AOT cache data returned from the generator */
export interface AOTCacheData {
    jitFnsCode: string;
    pureFnsCode: string;
    routerCacheCode: string;
}

/** AOT cache result including optional persistent child process */
export interface AOTCacheResult {
    data: AOTCacheData;
    /** The child process, only present when runMode is 'childProcess' (persist) */
    childProcess?: ChildProcess;
    /** Promise that resolves when the server calls setPlatformConfig() (childProcess mode only) */
    platformReady?: Promise<PlatformReadyData>;
}

/** IPC message type from the router's aotEmitter */
interface AOTCacheMessage {
    type: 'mion-aot-caches';
    jitFnsCode: string;
    pureFnsCode: string;
    routerCacheCode: string;
}

/** Platform config received from the server via IPC */
export interface PlatformReadyData {
    routerConfig: Record<string, unknown>;
    platformConfig: Record<string, unknown>;
}

interface PlatformReadyMessage extends PlatformReadyData {
    type: 'mion-platform-ready';
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
export async function generateAOTCaches(
    serverConfig: MionServerConfig,
    startScriptOverride?: string,
    isClient?: boolean
): Promise<AOTCacheResult> {
    const persist = serverConfig.runMode === 'childProcess';
    const startScript = resolve(startScriptOverride ?? serverConfig.startScript);
    const scriptDir = dirname(startScript);
    // The buildStart pre-pass is always "compile, IPC the AOT data, exit" — that's `buildOnly`
    // semantics. For runMode='middleware' or 'buildOnly' we use buildOnly here; only `childProcess`
    // keeps its own value because the spawned child must keep running as the live API server
    // (and emits AOT data via IPC alongside the live process).
    const childCompileMode = serverConfig.runMode === 'childProcess' ? 'childProcess' : 'buildOnly';

    // Determine the vite config to use
    // If viteConfig is provided, use it; otherwise let vite-node auto-discover
    const viteConfigArgs = serverConfig.viteConfig ? ['--config', resolve(serverConfig.viteConfig)] : [];

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
            child = fork(viteNodePath, [...viteConfigArgs, startScript, ...(serverConfig.args || [])], {
                env: {
                    ...process.env,
                    ...serverConfig.env,
                    MION_COMPILE: childCompileMode,
                    ...(isClient ? {MION_AOT_IS_CLIENT: 'true'} : {}),
                },
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

        /** Cleanup child process: clear timeout, disconnect IPC (only in non-persist mode), and optionally kill.
         *  In persist mode, IPC stays open for the mion-platform-ready message. */
        const cleanup = () => {
            clearTimeout(timeoutId);
            if (!persist && child.connected) child.disconnect();
            if (!persist) child.kill();
        };

        // Set up platform-ready listener BEFORE any messages arrive to avoid race conditions.
        // The child may send mion-platform-ready very quickly after mion-aot-caches.
        let platformReadyResolve: ((value: PlatformReadyData) => void) | undefined;
        const platformReady = persist
            ? new Promise<PlatformReadyData>((res) => {
                  platformReadyResolve = res;
              })
            : undefined;

        child.on('message', (msg: unknown) => {
            const message = msg as AOTCacheMessage | PlatformReadyMessage;
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
                    platformReady,
                });
            } else if (message?.type === 'mion-platform-ready' && platformReadyResolve) {
                platformReadyResolve({routerConfig: message.routerConfig, platformConfig: message.platformConfig});
                platformReadyResolve = undefined;
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
                log(`[mion-server] ${msg}`);
            } else if (process.env.DEBUG_AOT && msg) {
                log('[mion-aot] stdout:', msg);
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
                            `Make sure the startScript calls initMionRouter() and the router ` +
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
 *  Loads the startScript with MION_COMPILE=middleware so platform adapters skip server.listen().
 *  Generates AOT caches via SSR using a module loader (for same-Vite-process scenarios like Nuxt).
 *  After loading, retrieves the caches directly from the router's global state via getSerializedCaches(). */
export async function loadSSRRouterAndGenerateAOTCaches(
    loadModule: ModuleLoader,
    startScript: string,
    isClient?: boolean
): Promise<AOTCacheData> {
    const prevCompile = process.env.MION_COMPILE;
    const prevIsClient = process.env.MION_AOT_IS_CLIENT;
    process.env.MION_COMPILE = 'middleware';
    if (isClient) process.env.MION_AOT_IS_CLIENT = 'true';

    try {
        // Load the start server script — triggers initMionRouter(), populates caches,
        // skips process.send (SSR mode) and skips server.listen() (platform adapters)
        const mod = await loadModule(startScript);
        // Await any Promise-valued exports (e.g. initMionRouter() without top-level await)
        const promises = Object.values(mod).filter((v): v is Promise<any> => v instanceof Promise);
        if (promises.length > 0) await Promise.all(promises);

        // Get caches directly from the router's global state.
        // Use native import (not loadModule/ssrLoadModule) so we hit the same Node ESM
        // cache bucket the user's externalised `@mionjs/router` import populated.
        const aotModule = await import('@mionjs/router/aot');
        const caches: AOTCacheData = await aotModule.getSerializedCaches();
        return caches;
    } finally {
        if (prevCompile === undefined) delete process.env.MION_COMPILE;
        else process.env.MION_COMPILE = prevCompile;
        if (prevIsClient === undefined) delete process.env.MION_AOT_IS_CLIENT;
        else process.env.MION_AOT_IS_CLIENT = prevIsClient;
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
    log(`[mion]   jitFns: ${jitSize}, pureFns: ${pureSize}, routerCache: ${routerSize}`);

    if (process.env.DEBUG_AOT) {
        log('[mion] AOT jitFns cache:\n', data.jitFnsCode);
        log('[mion] AOT pureFns cache:\n', data.pureFnsCode);
        log('[mion] AOT routerCache:\n', data.routerCacheCode);
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

/** Generates the combined virtual module. Imports the three sub-virtual modules for the AOT
 *  caches plus the server-pure-fns virtual module — the latter is a side-effect import that
 *  populates the `mion.server-pure-fns/v1` globalThis slot. Without it, `routesFlow.ts`
 *  (which reads the slot via `getServerPureFn`) wouldn't see the user's `mapFrom` /
 *  `pureServerFn` entries when the server runs in vite-node-only contexts.
 *  Safe to share between client and server builds — `virtual:mion-server-pure-fns` is a no-op
 *  on the client (no extracted entries to populate). */
export function generateCombinedCachesModule(): string {
    return `/* Auto-generated combined AOT caches - do not edit */
import 'virtual:mion-server-pure-fns';
import { pureFnsCache } from 'virtual:mion-aot/pure-fns';
import { jitFnsCache } from 'virtual:mion-aot/jit-fns';
import { routerCache } from 'virtual:mion-aot/router-cache';

export const aotCaches = { jitFnsCache, pureFnsCache, routerCache };
export { jitFnsCache, pureFnsCache, routerCache };
`;
}

/** Waits for the server child process to send a mion-platform-ready IPC message. */
export function waitForPlatformReady(
    child: ChildProcess,
    timeoutMs = 30000
): Promise<{routerConfig: Record<string, unknown>; platformConfig: Record<string, unknown>}> {
    return new Promise((resolve, reject) => {
        const onMessage = (msg: unknown) => {
            const message = msg as PlatformReadyMessage;
            if (message?.type === 'mion-platform-ready') {
                clearTimeout(timeoutId);
                child.removeListener('message', onMessage);
                resolve({routerConfig: message.routerConfig, platformConfig: message.platformConfig});
            }
        };
        child.on('message', onMessage);
        const timeoutId = setTimeout(() => {
            child.removeListener('message', onMessage);
            reject(
                new Error(
                    `Server did not call setPlatformConfig() within ${timeoutMs / 1000}s. ` +
                        `Ensure your platform adapter (startNodeServer, startBunServer, etc.) is called after initMionRouter().`
                )
            );
        }, timeoutMs);
    });
}
