/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRTUtils} from '@ts-runtypes/core';
import {getOrCreateGlobal} from '../utils.ts';

// ############# routesFlow server mappers — a transport with a security boundary #############
//
// This module is NOT a pure-fn registry. Pure functions belong to @ts-runtypes; mion registers
// none of its own. What mion owns is the routesFlow `serverMapFrom` feature: letting a CLIENT
// name a mapper that runs on the SERVER, mid-flow, between two routes.
//
// Two lanes reach a mapper, both landing in the shared ts-runtypes pure-fn registry:
//
// - INLINE (vite builds): the client writes `serverMapFrom(order, (o) => o.userId)`. The mapper
//   carries ts-runtypes' PureFunction/InjectPureFnHash markers, so the mion vite plugin harvests
//   it from the build report, content-hashes it (`rt::<hash>`) and bakes the body into the server
//   bundle via the generated `.mion/server-mappers.generated.js` module → registerServerMappers below.
//
// - BY NAME (non-vite / CDN clients): the client writes `serverMapFrom(order, 'toUserId')`; the
//   server registers the mapper itself with @ts-runtypes' own registrar and opts the key into
//   wire-reachability:
//
//       registerPureFn('mionjs::toUserId', (order: Order) => order.userId);
//       allowServerMapper(serverMapperKey('toUserId'));
//
//   A literal key + an inline function literal is scanner-clean (no CTA003, no PFN001), so no
//   mion-side registration wrapper is needed — and mion no longer ships one.
//
// ############# the security boundary #############
//
// `allowedMapperKeys` is the ONLY gate on a wire-driven registry lookup, and it is load-bearing.
// The mapper key arrives in the URL query string (`?data=<base64url JSON>`), is JSON.parse'd with
// NO schema validation and no shape check, and goes straight to getServerMapper (see
// router/src/routesFlow.ts). Upstream's getPureFnByKey has no equivalent gate — by design, it is
// documented as the untracked door for exactly this wire-driven case, which makes gating mion's
// job, not upstream's.
//
// Without the allow-list, a request could name ANY entry in the shared registry. That is not
// hypothetical: mionAdapter's addSerializedJitCaches installs arbitrary `<ns>::<fn>` entries out of
// a server methods-metadata payload and never touches this set, so in an SSR process both lanes
// share one registry. Built-in `rt::`/`rtFormats::` fns and anything registered by an unrelated
// library in the same process are reachable too.
//
// Note the gate is on LANE OF REGISTRATION, not on namespace: `rt::` keys are exactly what the
// legitimate inline lane produces. Only keys that came through registerServerMappers or an
// explicit allowServerMapper call resolve.

/** Namespace for mapper keys registered by name on the server. */
export const SERVER_MAPPER_NAMESPACE = 'mionjs';

/** Builds the wire key for a named server mapper. This is the client↔server CONTRACT — the client
 *  puts this string in the routesFlow query and the server resolves it against its own registry —
 *  not a registration helper. Register the fn itself with @ts-runtypes' registerPureFn. */
export function serverMapperKey(name: string): string {
    return `${SERVER_MAPPER_NAMESPACE}::${name}`;
}

/** Keys resolvable as routesFlow mappers. See "the security boundary" above. */
const allowedMapperKeys = getOrCreateGlobal('mion.runTypes.allowedMapperKeys', () => new Set<string>());

/** Opts a server-registered pure fn into wire-reachability as a routesFlow mapper.
 *  Required for the name lane: @ts-runtypes' registrars write to the registry but know nothing
 *  about mion's gate, so a fn registered with registerPureFn alone is deliberately unreachable. */
export function allowServerMapper(pureFnId: string): void {
    allowedMapperKeys.add(pureFnId);
}

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

/** Registers harvested mapper entries into the ts-runtypes pure-fn cache (idempotent).
 *  Called by the generated `.mion/server-mappers.generated.js` module in the server bundle. */
export function registerServerMappers(entries: ServerMapperEntry[]): void {
    const utl = getRTUtils();
    for (const entry of entries) {
        if (!entry?.key) continue;
        if (utl.hasPureFnByKey(entry.key)) {
            allowedMapperKeys.add(entry.key);
            continue;
        }
        if (!entry.code) {
            console.warn(`[mion serverMappers] mapper '${entry.key}' has no code payload (emitMode without code?) — skipped.`);
            continue;
        }
        const sep = entry.key.indexOf('::');
        const compiled = {
            namespace: sep > 0 ? entry.key.slice(0, sep) : '',
            fnName: sep > 0 ? entry.key.slice(sep + 2) : entry.key,
            bodyHash: sep > 0 ? entry.key.slice(sep + 2) : '',
            paramNames: entry.paramNames ?? [],
            code: entry.code,
            pureFnDependencies: entry.pureFnDependencies ?? [],
            // createPureFn deliberately ABSENT: ts-runtypes' initPureFunction lazily rebuilds
            // the factory from code+paramNames on first lookup (its own code-mode lane), so a
            // malformed entry surfaces at first use instead of crashing server boot, and
            // unused mappers are never compiled.
        };
        // addPureFn is the low-level door, and the only option here: every upstream registrar
        // demands a literal key (CompTimeArgs) or an inline function literal (PureFunction), and
        // this entry has neither — the key is a content hash read from JSON and the body is a string.
        utl.addPureFn(entry.key, compiled as never);
        allowedMapperKeys.add(entry.key);
    }
}

/** Installs the manifest re-reader used to lazily resolve mappers registered after server start. */
export function installServerMapperReader(read: () => ServerMapperEntry[]): void {
    mapperReaderStore.read = read;
    registerServerMappers(read());
}

/** Resolves a routesFlow mapping key (`rt::<hash>` | `mionjs::<name>`), re-reading the manifest on a
 *  miss. Gated on the allow-list: a wire key never resolves a registry entry that no mion lane and
 *  no explicit allowServerMapper call opted in. */
export function getServerMapper(key: string): ((...args: any[]) => any) | undefined {
    if (!allowedMapperKeys.has(key)) {
        if (!mapperReaderStore.read) return undefined;
        registerServerMappers(mapperReaderStore.read());
        if (!allowedMapperKeys.has(key)) return undefined;
    }
    return getRTUtils().getPureFnByKey(key);
}

/** True when a routesFlow mapping key resolves (after a lazy manifest re-read on miss). */
export function hasServerMapper(key: string): boolean {
    return getServerMapper(key) !== undefined;
}
