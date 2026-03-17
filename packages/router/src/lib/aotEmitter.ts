/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    getJitFnCaches,
    getENV,
    isMionAOTEmitMode,
    JitFunctionsCache,
    PureFunctionsCache,
    MethodsCache,
    SrcCodeJITCompiledFnsCache,
    SrcCodePureFunctionsCache,
    JIT_FUNCTION_IDS,
} from '@mionjs/core';
import {getPersistedMethods} from './methodsCache.ts';
import {createToJavascriptFn} from '@mionjs/run-types';

/** IPC message type for AOT cache emission */
export interface AOTCacheMessage {
    type: 'mion-aot-caches';
    jitFnsCode: string;
    pureFnsCode: string;
    routerCacheCode: string;
}

/** IPC message sent by setPlatformConfig() to signal server readiness */
export interface PlatformReadyMessage {
    type: 'mion-platform-ready';
    routerConfig: Record<string, unknown>;
    platformConfig: Record<string, unknown>;
}

/** Serialized cache data before converting to JS code */
export interface SerializedCaches {
    jitFnsCode: string;
    pureFnsCode: string;
    routerCacheCode: string;
}

/** JIT function IDs to exclude from AOT caches (toJSCode is only needed at compile time) */
const EXCLUDED_JIT_FN_IDS = [JIT_FUNCTION_IDS.toJSCode];

/** Pure function names to exclude from AOT caches */
const EXCLUDED_PURE_FN_NAMES = ['sanitizeCompiledFn'];

/** Returns serialized caches for in-process AOT generation (no IPC needed). Call after initMionRouter(). */
export async function getSerializedCaches(): Promise<SerializedCaches> {
    const {jitFnsCache, pureFnsCache} = getJitFnCaches();
    const routerCache = getPersistedMethods();
    return serializeCachesToCode(jitFnsCache, pureFnsCache, routerCache);
}

/**
 * Emits AOT caches to the parent process via IPC when running in MION_COMPILE mode.
 * This function is called automatically at the end of initMionRouter() and can also
 * be called manually for multi-step route registration patterns.
 */
export async function emitAOTCaches(): Promise<void> {
    // Only emit in AOT generation mode (compile, SSR, or serve)
    if (!isMionAOTEmitMode()) return;
    // middleware mode: caches remain in global state, read directly via getSerializedCaches()
    if (getENV('MION_COMPILE') === 'middleware') return;

    // IPC mode: send to parent process
    if (typeof process.send !== 'function') return;

    // Get the caches
    const {jitFnsCache, pureFnsCache} = getJitFnCaches();
    const routerCache = getPersistedMethods();

    // Serialize caches to JS code (filtering happens inside, after createToJavascriptFn)
    const serialized = await serializeCachesToCode(jitFnsCache, pureFnsCache, routerCache);

    // Send to parent process
    const message: AOTCacheMessage = {
        type: 'mion-aot-caches',
        ...serialized,
    };

    process.send(message);
}

/**
 * Serializes the caches to JavaScript code strings using run-types toJSCode.
 * Filtering is done AFTER createToJavascriptFn because it adds compile-time-only JIT functions
 * to the global caches that should be excluded from the serialized output.
 */
export async function serializeCachesToCode(
    jitFnsCache: JitFunctionsCache,
    pureFnsCache: PureFunctionsCache,
    routerCache: MethodsCache
): Promise<SerializedCaches> {
    const jitToJSCode = createToJavascriptFn<SrcCodeJITCompiledFnsCache>();
    const pureToJSCode = createToJavascriptFn<SrcCodePureFunctionsCache>();
    const routerToJSCode = createToJavascriptFn<MethodsCache>();
    // Filter AFTER createToJavascriptFn to exclude compile-time-only items (including those just added)
    const finalJitFns = filterExcludedJitFns(jitFnsCache, EXCLUDED_JIT_FN_IDS);
    const finalPureFns = filterExcludedPureFns(pureFnsCache, EXCLUDED_PURE_FN_NAMES);
    return {
        jitFnsCode: jitToJSCode(finalJitFns as unknown as SrcCodeJITCompiledFnsCache),
        pureFnsCode: pureToJSCode(finalPureFns as unknown as SrcCodePureFunctionsCache),
        routerCacheCode: routerToJSCode(routerCache),
    };
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
