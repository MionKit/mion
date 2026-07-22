/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRTFnCaches, getRTUtils} from '@ts-runtypes/core';
import type {AnyFn, JitCompiledFn} from '../types/general.types.ts';
import type {CompiledPureFunction} from '../types/pureFunctions.types.ts';

// ############# ts-runtypes cache resolver (leaf module) #############
// Low-level lookups from the @ts-runtypes/core runtime cache into mion's JitCompiledFn
// shape. Kept dependency-free of routerUtils/jitUtils so jitUtils can resolve jit/pure
// fns directly (no cross-module cycle, no install-a-backend indirection). This is what
// replaced the old `installJitLookupBackend` seam once run-types folded into core.

/** ts-runtypes fn-cache entry shape consumed by the adapter (subset of CompiledTypeFn). */
export interface RtCacheEntry {
    typeName: string;
    familyTag?: string;
    rtFnHash: string;
    args: Record<string, string>;
    defaultParamValues: Record<string, string>;
    isNoop?: boolean;
    code?: string;
    rtDependencies?: string[];
    pureFnDependencies?: string[];
    createRTFn?: (utl: unknown) => AnyFn;
    fn?: AnyFn;
}

/** Normalizes entry arg maps to mion's JitFnArgs contract (string values only). */
export function normalizeArgs(args: unknown): JitCompiledFn['args'] {
    const out: Record<string, string> = {};
    if (args && typeof args === 'object') {
        for (const [key, value] of Object.entries(args)) if (typeof value === 'string') out[key] = value;
    }
    if (!('vλl' in out)) out.vλl = 'v';
    return out as JitCompiledFn['args'];
}

/** Wraps a resolved ts-runtypes cache entry into the JitCompiledFn shape mion consumes. */
export function wrapRtEntry<Fn extends AnyFn>(entry: RtCacheEntry, fnID: string): JitCompiledFn<Fn> {
    return {
        typeName: entry.typeName,
        fnID,
        jitFnHash: entry.rtFnHash,
        args: normalizeArgs(entry.args),
        defaultParamValues: normalizeArgs(entry.defaultParamValues),
        isNoop: !!entry.isNoop,
        code: entry.code ?? '',
        jitDependencies: entry.rtDependencies,
        pureFnDependencies: entry.pureFnDependencies,
        createJitFn: (entry.createRTFn ?? (() => entry.fn)) as JitCompiledFn<Fn>['createJitFn'],
        fn: entry.fn as Fn,
    };
}

/** Fabricates a JitCompiledFn wrapper for fns with no cache entry (fallback lane). */
export function toJitCompiledFn<Fn extends AnyFn>(fn: Fn, fnID: string, typeName: string, jitFnHash: string): JitCompiledFn<Fn> {
    return {
        typeName,
        fnID,
        jitFnHash,
        args: {vλl: 'v'},
        defaultParamValues: {vλl: 'v'},
        isNoop: false,
        code: '',
        createJitFn: () => fn,
        fn,
    };
}

/** Looks up the full ts-runtypes cache entry for a mion jit hash (`<fnHashPrefix>_<typeId>`). */
export function getRtEntry(rtFnHash: string): RtCacheEntry | undefined {
    return getRTUtils().getRT(rtFnHash) as RtCacheEntry | undefined;
}

/** Resolves a mion jit hash to a JitCompiledFn straight from the ts-runtypes cache. */
export function resolveJIT(jitFnHash: string): JitCompiledFn | undefined {
    const entry = getRtEntry(jitFnHash);
    return entry ? wrapRtEntry(entry, entry.familyTag ?? 'rtFn') : undefined;
}

/** Resolves a mion pure fn (`<namespace>::<name>`) from the ts-runtypes pure-fn cache.
 *  Raw-cache lookup (NOT rtUtils.getCompiledPureFn): the key is computed at runtime, and the
 *  CompTimeArgs-tracked form would emit CTA003 in every consumer build. */
export function resolveCompiledPureFn(namespace: string, name: string): CompiledPureFunction | undefined {
    const cache = getRTFnCaches().pureFnsCache as Record<string, unknown>;
    return cache[`${namespace}::${name}`] as CompiledPureFunction | undefined;
}
