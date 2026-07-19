/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRTFnCaches, getRTUtils} from '@ts-runtypes/core';
import {getOrCreateGlobal} from '@mionjs/core';
import type {PureFnId} from '@ts-runtypes/core';

// ############# mion pure functions — ts-runtypes registry, 'mionjs' namespace #############
// mion pure functions live in the ts-runtypes runtime registry. Two lanes:
// - NAMED (this module's helpers): server code registers a factory under `mionjs::<name>`
//   at RUNTIME through the low-level cache (getRTUtils().addPureFn) — deliberately NOT the
//   ts-runtypes registrars, whose CompTimeArgs/PureFunction markers would flag the
//   computed key + runtime factory (CTA003/PFN001) at every consumer build. No build
//   metadata (bodyHash, purity checks, shippable code) — fine for server-side execution.
// - ANONYMOUS/INLINE (serverMapFrom): the mion vite plugin extracts the mapper at build
//   time (ts-runtypes markers), content-hashes it (`rt::<hash>`) and moves the body into
//   the server bundle via the server-mappers manifest (see registerServerMappers below).

/** Namespace for every mion-owned pure function in the ts-runtypes registry. */
export const MION_PURE_FN_NAMESPACE = 'mionjs';

/** Builds the ts-runtypes registry key for a mion pure fn name. */
export function mionPureFnId(name: string): PureFnId {
    return `${MION_PURE_FN_NAMESPACE}::${name}`;
}

/** Live pure-fn cache entry shape (mirror of ts-runtypes CompiledPureFunction). */
interface MionCompiledPureFn {
    namespace: string;
    fnName: string;
    bodyHash: string;
    paramNames: string[];
    code: string;
    pureFnDependencies: string[];
    createPureFn: (utl: unknown) => (...args: any[]) => any;
    fn?: (...args: any[]) => any;
}

/** The live ts-runtypes pure-fn cache (the original object, string-keyed). */
function pureFnsCache(): Record<string, MionCompiledPureFn | undefined> {
    return getRTFnCaches().pureFnsCache as Record<string, MionCompiledPureFn | undefined>;
}

/** Registers a pure function factory under the mionjs namespace (runtime lane, re-registration overrides). */
export function registerMionPureFn<Fn extends (...args: any[]) => any>(name: string, factory: (utl: unknown) => Fn) {
    const key = mionPureFnId(name);
    const existing = pureFnsCache()[key];
    if (existing) {
        existing.createPureFn = factory;
        existing.fn = undefined;
        return existing;
    }
    const compiled: MionCompiledPureFn = {
        namespace: MION_PURE_FN_NAMESPACE,
        fnName: name,
        bodyHash: '',
        paramNames: [],
        code: '',
        pureFnDependencies: [],
        createPureFn: factory,
    };
    return getRTUtils().addPureFn(key, compiled as never);
}

/** Returns the callable pure fn registered as `mionjs::<name>`, or undefined. */
export function getMionPureFn(name: string): ((...args: any[]) => any) | undefined {
    return getRTUtils().getPureFnByKey(mionPureFnId(name));
}

/** True when `mionjs::<name>` exists in the ts-runtypes pure-fn registry. */
export function hasMionPureFn(name: string): boolean {
    return getRTUtils().hasPureFnByKey(mionPureFnId(name));
}

// ############# serverMapFrom transport — build-harvested mapper registration #############
// The mion vite plugin harvests every client `serverMapFrom(source, mapper)` call from the
// ts-runtypes pure-fn build report and writes a manifest of {key, paramNames, code}
// entries; the SERVER bundle registers them here (via the virtual:mion/server-mappers
// module the plugin generates). The wire carries only the key — the server executes only
// mappers its own build baked in; an unknown key is rejected, never evaluated.

/** One harvested serverMapFrom mapper (subset of the ts-runtypes PureFnSite report record). */
export interface ServerMapperEntry {
    /** Full registry key, e.g. `rt::<contentHash>`. */
    key: string;
    paramNames?: string[];
    /** Factory body — rebuilt exactly like ts-runtypes' own code-mode lane. */
    code?: string;
    pureFnDependencies?: string[];
}

/** Cross-instance store for the manifest re-reader (survives duplicated module instances). */
const mapperReaderStore = getOrCreateGlobal('mion.runTypes.serverMapperReader', () => ({
    read: undefined as (() => ServerMapperEntry[]) | undefined,
}));

/** Registers harvested mapper entries into the ts-runtypes pure-fn cache (idempotent). */
export function registerServerMappers(entries: ServerMapperEntry[]): void {
    const utl = getRTUtils();
    for (const entry of entries) {
        if (!entry?.key || utl.hasPureFnByKey(entry.key)) continue;
        if (!entry.code) {
            console.warn(`[mion run-types] server mapper '${entry.key}' has no code payload (emitMode without code?) — skipped.`);
            continue;
        }
        const sep = entry.key.indexOf('::');
        const paramNames = entry.paramNames ?? [];
        const code = entry.code;
        const compiled: MionCompiledPureFn = {
            namespace: sep > 0 ? entry.key.slice(0, sep) : '',
            fnName: sep > 0 ? entry.key.slice(sep + 2) : entry.key,
            bodyHash: sep > 0 ? entry.key.slice(sep + 2) : '',
            paramNames,
            code,
            pureFnDependencies: entry.pureFnDependencies ?? [],
            // same rebuild as ts-runtypes rtUtils buildPureFnFactoryFromCode (code-mode lane):
            // the factory is `new Function(...paramNames, code)` in strict mode.
            createPureFn: new Function(...paramNames, `'use strict'; ${code}`) as MionCompiledPureFn['createPureFn'],
        };
        utl.addPureFn(entry.key, compiled as never);
    }
}

/** Installs the manifest re-reader used to lazily resolve mappers registered after server start. */
export function installServerMapperReader(read: () => ServerMapperEntry[]): void {
    mapperReaderStore.read = read;
    registerServerMappers(read());
}

/** Resolves a routesFlow mapping key (`rt::<hash>` | `mionjs::<name>`), re-reading the manifest on a miss. */
export function getServerMapper(key: string): ((...args: any[]) => any) | undefined {
    const utl = getRTUtils();
    const fn = utl.getPureFnByKey(key);
    if (fn || !mapperReaderStore.read) return fn;
    registerServerMappers(mapperReaderStore.read());
    return utl.getPureFnByKey(key);
}

/** True when a routesFlow mapping key resolves (after a lazy manifest re-read on miss). */
export function hasServerMapper(key: string): boolean {
    return getServerMapper(key) !== undefined;
}
