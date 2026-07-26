/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRTFnCaches, getRTUtils} from '@ts-runtypes/core';
import type {AnyFn, CompiledTypeFn} from '../types/general.types.ts';
import type {CompiledPureFunction} from '../types/pureFunctions.types.ts';

// ############# ts-runtypes cache resolver (leaf module) #############
// Low-level lookups from the @ts-runtypes/core runtime cache using @ts-runtypes' own CompiledTypeFn
// shape (mion's RtCacheEntry mirror was deleted). Kept dependency-free of routerUtils so
// there is no cross-module cycle and no install-a-backend indirection — this is what
// replaced the old `installJitLookupBackend` seam once run-types folded into core.

/** Normalizes entry arg maps to mion's JitFnArgs contract (string values only). */
export function normalizeArgs(args: unknown): CompiledTypeFn['args'] {
    const out: Record<string, string> = {};
    if (args && typeof args === 'object') {
        for (const [key, value] of Object.entries(args)) if (typeof value === 'string') out[key] = value;
    }
    if (!('vλl' in out)) out.vλl = 'v';
    return out as CompiledTypeFn['args'];
}

/** Wraps a resolved ts-runtypes cache entry into the CompiledTypeFn shape mion consumes. */
export function wrapRtEntry<Fn extends AnyFn>(entry: CompiledTypeFn, fnID: string): CompiledTypeFn<Fn> {
    return {
        ...entry,
        fnID,
        args: normalizeArgs(entry.args),
        defaultParamValues: normalizeArgs(entry.defaultParamValues),
        isNoop: !!entry.isNoop,
        code: entry.code ?? '',
        createRTFn: (entry.createRTFn ?? (() => entry.fn)) as CompiledTypeFn<Fn>['createRTFn'],
        fn: entry.fn as Fn,
    };
}

/** Fabricates a CompiledTypeFn wrapper for fns with no cache entry (fallback lane). */
export function toJitCompiledFn<Fn extends AnyFn>(fn: Fn, fnID: string, typeName: string, rtFnHash: string): CompiledTypeFn<Fn> {
    return {
        typeName,
        fnID,
        rtFnHash,
        args: {vλl: 'v'},
        defaultParamValues: {vλl: 'v'},
        isNoop: false,
        code: '',
        createRTFn: () => fn,
        fn,
    };
}

/** Looks up the full ts-runtypes cache entry for a mion jit hash (`<fnHashPrefix>_<typeId>`). */
export function getRtEntry(rtFnHash: string): CompiledTypeFn | undefined {
    return getRTUtils().getRT(rtFnHash);
}

/** Resolves a mion jit hash to a CompiledTypeFn straight from the ts-runtypes cache. */
export function resolveJIT(rtFnHash: string): CompiledTypeFn | undefined {
    const entry = getRtEntry(rtFnHash);
    return entry ? wrapRtEntry(entry, entry.familyTag ?? 'rtFn') : undefined;
}

/** Resolves a mion pure fn (`<namespace>::<name>`) from the ts-runtypes pure-fn cache.
 *  Raw-cache lookup (NOT rtUtils.getCompiledPureFn): the key is computed at runtime, and the
 *  CompTimeArgs-tracked form would emit CTA003 in every consumer build. */
export function resolveCompiledPureFn(namespace: string, name: string): CompiledPureFunction | undefined {
    const cache = getRTFnCaches().pureFnsCache as Record<string, unknown>;
    return cache[`${namespace}::${name}`] as CompiledPureFunction | undefined;
}
