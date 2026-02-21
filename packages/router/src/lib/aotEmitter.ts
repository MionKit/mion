/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    getJitFnCaches,
    getENV,
    JitFunctionsCache,
    PureFunctionsCache,
    SrcCodeJITCompiledFnsCache,
    PersistedPureFunctionsCache,
    MethodsCache,
} from '@mionkit/core';
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
 * 4. Applies exclusions (e.g., compile-time-only functions)
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

    // Apply exclusions (router cache doesn't need exclusions)
    const finalJitFns = filterExcludedJitFns(jitFnsCache, EXCLUDED_JIT_FN_IDS);
    const finalPureFns = filterExcludedPureFns(pureFnsCache, EXCLUDED_PURE_FN_NAMES);

    // Serialize caches to JS code
    // Using Persisted types so fn is serialized as undefined (recreated from createJitFn/createPureFn at restore time)
    const serialized = await serializeCachesToCode(finalJitFns, finalPureFns, routerCache);

    // Send to parent process
    const message: AOTCacheMessage = {
        type: 'mion-aot-caches',
        ...serialized,
    };

    process.send(message);
}

/** Serializes the caches to JavaScript code strings using run-types toJSCode. */
async function serializeCachesToCode(
    jitFnsCache: JitFunctionsCache,
    pureFnsCache: PureFunctionsCache,
    routerCache: MethodsCache
): Promise<SerializedCaches> {
    // Persisted types have fn:undefined so the serializer won't try to serialize runtime functions
    // isJitFnCode/isPureFnCode tell the serializer to generate createJitFn/createPureFn closures from the code property
    const jitToJSCode = createToJavascriptFn<SrcCodeJITCompiledFnsCache>({isJitFnCode: true});
    const pureToJSCode = createToJavascriptFn<PersistedPureFunctionsCache>({isPureFnCode: true});
    const routerToJSCode = createToJavascriptFn<MethodsCache>();

    return {
        jitFnsCode: jitToJSCode(jitFnsCache as unknown as SrcCodeJITCompiledFnsCache),
        pureFnsCode: pureToJSCode(pureFnsCache as unknown as PersistedPureFunctionsCache),
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
