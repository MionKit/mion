/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * AOT Cache Emitter Module
 *
 * This module is NOT exported from the main @mionkit/router package to avoid
 * loading it in production. It is dynamically imported using `importModule` from
 * @mionkit/core only when MION_COMPILE=true.
 *
 * For multi-step route registration patterns, you can manually import and call emitAOTCaches:
 *
 * @example
 * ```ts
 * import { importModule } from '@mionkit/core';
 *
 * // Multi-step route registration pattern
 * await initRouter();
 * await registerRoutes(routes1);
 * await registerRoutes(routes2);
 *
 * // Manually emit caches if in compile mode
 * if (process.env.MION_COMPILE === 'true') {
 *   const aotEmitter = await importModule<typeof import('./lib/aotEmitter.ts')>(
 *     './lib/aotEmitter.ts',
 *     __dirname
 *   );
 *   await aotEmitter.emitAOTCaches();
 * }
 * ```
 */

import {getJitFnCaches, getENV, JitFunctionsCache, PureFunctionsCache, MethodsCache} from '@mionkit/core';
import {getPersistedMethods} from './methodsCache.ts';
import {createToJavascriptFn} from '@mionkit/run-types';

/** IPC message type for AOT cache emission */
export interface AOTCacheMessage {
    type: 'mion-aot-caches';
    jitFnsCode: string;
    pureFnsCode: string;
    routerCacheCode: string;
}

/** Serialized cache data before converting to JS code */
export interface SerializedCaches {
    jitFnsCode: string;
    pureFnsCode: string;
    routerCacheCode: string;
}

/** Interface for cacheable items with _used tracking flag */
interface Cacheable {
    _used?: boolean;
}

/** JIT function IDs to exclude from AOT caches (toJSCode is only needed at compile time) */
const EXCLUDED_JIT_FN_IDS = ['toJSCode'];

/** Pure function names to exclude from AOT caches */
const EXCLUDED_PURE_FN_NAMES = ['sanitizeCompiledFn'];

/**
 * Emits AOT caches to the parent process via IPC when running in MION_COMPILE mode.
 * This function is called automatically at the end of initMionRouter() and can also
 * be called manually for multi-step route registration patterns.
 *
 * The function:
 * 1. Checks if running in MION_COMPILE mode (env var)
 * 2. Checks if process.send is available (running as child process with IPC)
 * 3. Collects all caches from core (JIT functions, pure functions) and router (methods)
 * 4. Filters to only include used entries (marked with _used flag by compile tracking)
 * 5. Serializes caches to JS code using run-types toJSCode
 * 6. Sends the serialized caches to the parent process via IPC
 */
export async function emitAOTCaches(): Promise<void> {
    // Only emit in compile mode
    if (getENV('MION_COMPILE') !== 'true') return;

    // Only emit if running as child process with IPC
    if (typeof process.send !== 'function') return;

    // Get the caches
    const {jitFnsCache, pureFnsCache} = getJitFnCaches();
    const routerCache = getPersistedMethods();

    // Filter to only used entries
    const filteredJitFns = filterUsedJitFns(jitFnsCache);
    const filteredPureFns = filterUsedPureFns(pureFnsCache);
    const filteredRouterCache = filterUsedRouterCache(routerCache);

    // Apply exclusions (router cache doesn't need exclusions)
    const finalJitFns = filterExcludedJitFns(filteredJitFns, EXCLUDED_JIT_FN_IDS);
    const finalPureFns = filterExcludedPureFns(filteredPureFns, EXCLUDED_PURE_FN_NAMES);

    // Serialize caches to JS code
    const serialized = await serializeCachesToCode(finalJitFns, finalPureFns, filteredRouterCache);

    // Send to parent process
    const message: AOTCacheMessage = {
        type: 'mion-aot-caches',
        ...serialized,
    };

    process.send(message);
}

/**
 * Serializes the caches to JavaScript code strings using run-types toJSCode.
 * This dynamically imports @mionkit/run-types to avoid loading it when not needed.
 */
async function serializeCachesToCode(
    jitFnsCache: JitFunctionsCache,
    pureFnsCache: PureFunctionsCache,
    routerCache: MethodsCache
): Promise<SerializedCaches> {
    // Create toJSCode functions for each cache type
    const jitToJSCode = createToJavascriptFn<JitFunctionsCache>();
    const pureToJSCode = createToJavascriptFn<PureFunctionsCache>();
    const routerToJSCode = createToJavascriptFn<MethodsCache>();

    return {
        jitFnsCode: jitToJSCode(jitFnsCache),
        pureFnsCode: pureToJSCode(pureFnsCache),
        routerCacheCode: routerToJSCode(routerCache),
    };
}

/**
 * Filters JIT functions cache to only include entries marked as used.
 * Removes the _used flag from the output.
 */
function filterUsedJitFns(jitFnsCache: Readonly<JitFunctionsCache>): JitFunctionsCache {
    return Object.fromEntries(
        Object.entries(jitFnsCache)
            .filter(([, value]) => (value as Cacheable)._used === true)
            .map(([key, value]) => [key, {...value, _used: undefined}])
    ) as JitFunctionsCache;
}

/**
 * Filters pure functions cache to only include entries marked as used.
 * Removes the _used flag from the output.
 */
function filterUsedPureFns(pureFnsCache: Readonly<PureFunctionsCache>): PureFunctionsCache {
    return Object.fromEntries(
        Object.entries(pureFnsCache).map(([namespace, nsCache]) => [
            namespace,
            Object.fromEntries(
                Object.entries(nsCache)
                    .filter(([, value]) => (value as Cacheable)._used === true)
                    .map(([key, value]) => [key, {...value, _used: undefined}])
            ),
        ])
    ) as PureFunctionsCache;
}

/**
 * Filters router cache to only include entries marked as used.
 * Removes the _used flag from the output.
 */
function filterUsedRouterCache(routerCache: Readonly<MethodsCache>): MethodsCache {
    return Object.fromEntries(
        Object.entries(routerCache)
            .filter(([, value]) => (value as Cacheable)?._used === true)
            .map(([key, value]) => [key, {...value, _used: undefined}])
    ) as MethodsCache;
}

/**
 * Filters out excluded JIT functions by their function ID.
 * toJSCode is excluded because it's only needed at compile time.
 */
function filterExcludedJitFns(jitFnsCache: JitFunctionsCache, excludedFnIds: string[]): JitFunctionsCache {
    if (!excludedFnIds.length) return jitFnsCache;
    return Object.fromEntries(
        Object.entries(jitFnsCache).filter(([, value]) => !excludedFnIds.includes(value.fnID as string))
    ) as JitFunctionsCache;
}

/**
 * Filters out excluded pure functions by their function name.
 * sanitizeCompiledFn is excluded because it's only needed at compile time.
 */
function filterExcludedPureFns(pureFnsCache: PureFunctionsCache, excludedFnNames: string[]): PureFunctionsCache {
    if (!excludedFnNames.length) return pureFnsCache;
    return Object.fromEntries(
        Object.entries(pureFnsCache).map(([namespace, nsCache]) => [
            namespace,
            Object.fromEntries(Object.entries(nsCache).filter(([, value]) => !excludedFnNames.includes(value.fnName))),
        ])
    ) as PureFunctionsCache;
}
