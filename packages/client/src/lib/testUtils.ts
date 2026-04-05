/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {addAOTCaches, resetJitFnCaches, resetJitFunctionsCache, MION_ROUTES, getJitFnHashes, routesCache} from '@mionjs/core';
import type {PersistedJitFunctionsCache} from '@mionjs/core';
import {getAOTCaches} from '../aot/aotCaches.ts';

/**
 * Resets client caches preserving MION internal routes and their JIT dependencies.
 * Only for testing — simulates app restart without losing MION infrastructure.
 */
export function resetClientCaches() {
    const {jitFnsCache, pureFnsCache} = getAOTCaches();
    // Clear only user routes, keep internal MION_ROUTES (needed for fetch calls)
    const mionRouteIds = new Set(Object.values(MION_ROUTES) as string[]);
    const cache = routesCache.getCache();
    for (const key in cache) {
        if (!mionRouteIds.has(key)) delete cache[key];
    }
    // Full JIT reset is safe — only MION internal route JIT caches will be re-registered below
    resetJitFnCaches();
    resetJitFunctionsCache();
    // Collect individual JIT hashes needed by MION internal routes and their transitive dependencies
    const neededJitHashes = new Set<string>();
    const neededPureFnKeys = new Set<string>();
    for (const routeId of mionRouteIds) {
        const meta = routesCache.getMetadata(routeId);
        if (!meta) continue;
        collectJitDepsFromParentHash(meta.paramsJitHash, neededJitHashes, neededPureFnKeys, jitFnsCache);
        collectJitDepsFromParentHash(meta.returnJitHash, neededJitHashes, neededPureFnKeys, jitFnsCache);
        if (meta.headersParam)
            collectJitDepsFromParentHash(meta.headersParam.jitHash, neededJitHashes, neededPureFnKeys, jitFnsCache);
        if (meta.headersReturn)
            collectJitDepsFromParentHash(meta.headersReturn.jitHash, neededJitHashes, neededPureFnKeys, jitFnsCache);
    }
    // Re-register only the filtered AOT caches for MION internal routes
    const filteredJitFns: Record<string, any> = {};
    for (const hash of neededJitHashes) {
        if (hash in jitFnsCache) filteredJitFns[hash] = jitFnsCache[hash];
    }
    const filteredPureFns: Record<string, Record<string, any>> = {};
    for (const key of neededPureFnKeys) {
        const [ns, fnHash] = key.split('::');
        if (pureFnsCache[ns]?.[fnHash]) {
            if (!filteredPureFns[ns]) filteredPureFns[ns] = {};
            filteredPureFns[ns][fnHash] = pureFnsCache[ns][fnHash];
        }
    }
    if (Object.keys(filteredJitFns).length > 0 || Object.keys(filteredPureFns).length > 0) {
        addAOTCaches(filteredJitFns, filteredPureFns);
    }
}

/** Expands a parent JIT hash into individual function hashes and collects their transitive dependencies */
function collectJitDepsFromParentHash(
    parentHash: string,
    jitHashes: Set<string>,
    pureFnKeys: Set<string>,
    jitFnsCache: PersistedJitFunctionsCache
) {
    if (!parentHash) return;
    const hashes = getJitFnHashes(parentHash);
    for (const individualHash of Object.values(hashes) as string[]) {
        collectJitDeps(individualHash, jitHashes, pureFnKeys, jitFnsCache);
    }
}

/** Transitively collects JIT and pure function dependency hashes from the AOT cache */
function collectJitDeps(hash: string, jitHashes: Set<string>, pureFnKeys: Set<string>, jitFnsCache: PersistedJitFunctionsCache) {
    if (!hash || jitHashes.has(hash)) return;
    jitHashes.add(hash);
    const entry = jitFnsCache[hash];
    if (!entry) return;
    for (const dep of entry.jitDependencies || []) collectJitDeps(dep, jitHashes, pureFnKeys, jitFnsCache);
    for (const pureDep of entry.pureFnDependencies || []) pureFnKeys.add(pureDep);
}
