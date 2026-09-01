/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRTUtils, registerPureFn} from '@mionjs/run-types';
import {getOrCreateGlobal} from '../utils.ts';

// ############# routesFlow server mappers — a transport with a security boundary #############
//
// This module is NOT a pure-fn registry. Pure functions belong to RunTypes; mion registers
// none of its own. What mion owns is the routesFlow `serverMapFrom` feature: letting a CLIENT
// name a mapper that runs on the SERVER, mid-flow, between two routes.
//
// Two lanes reach a mapper, both landing in the shared mion pure-fn registry:
//
// - INLINE (vite builds): the client writes `serverMapFrom(order, (o) => o.userId)`. The mapper
//   carries mion' PureFunction/InjectPureFnHash markers, so mion already compiles it
//   into its OWN generated module (`__runtypes/types/pf/rt/<hash>.js`) and content-hashes the call
//   site to `rt::<hash>`. The mion vite plugin harvests that site from the build report and records
//   which keys the client asked the server to run, plus where each one's generated module is. The
//   generated `.mion/server-mappers.generated.js` then IMPORTS those modules and registers each tuple
//   through registerServerMapperTuple below — mion no longer keeps a copy of any mapper body.
//
//   Dev/serve is the exception: the server can boot before the client build has finished harvesting,
//   so that lane keeps reading the manifest (code payload included) through installServerMapperReader
//   → registerServerMappers. A static import cannot resolve a module that does not exist yet, and the
//   on-miss re-read is synchronous because getServerMapper sits on the router's request path.
//
// - BY NAME (non-vite / CDN clients): the client writes `serverMapFrom(order, 'toUserId')`; the
//   server registers the mapper itself with RunTypes' own registrar and opts the key into
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
 *  not a registration helper. Register the fn itself with RunTypes' registerPureFn. */
export function serverMapperKey(name: string): string {
  return `${SERVER_MAPPER_NAMESPACE}::${name}`;
}

/** Keys resolvable as routesFlow mappers. See "the security boundary" above. */
const allowedMapperKeys = getOrCreateGlobal('mion.runTypes.allowedMapperKeys', () => new Set<string>());

/** Opts a server-registered pure fn into wire-reachability as a routesFlow mapper.
 *  Required for the name lane: RunTypes' registrars write to the registry but know nothing
 *  about mion's gate, so a fn registered with registerPureFn alone is deliberately unreachable. */
export function allowServerMapper(pureFnId: string): void {
  allowedMapperKeys.add(pureFnId);
}

// RunTypes' registrars are BUILD-TIME markers: the scanner reads the inline function literal at
// the call site, emits it as a generated pure-fn module, and rewrites the call to pass that module's
// entry tuple. So `registerPureFn(key, tuple)` is the shape the transform PRODUCES, and passing a
// tuple from source is rejected as `error PFN001: PureFunction<F> argument must be an INLINE arrow or
// function expression`. mion's inline lane has neither half a marker call needs — its key is a content
// hash read from a build manifest and its body is a tuple imported from the client's generated tree —
// so it needs the untracked door, exactly as the wire-driven lookup already uses getPureFnByKey.
//
// The alias below IS that door: the scanner matches the callee at the call site, so routing through a
// local const takes this one call out of its view while keeping upstream's real runtime behaviour —
// registerPureFn recognises an entry tuple, hands it to initFromTuple, and walks the tuple's whole dep
// closure. Kept here, once, commented, instead of spread across generated files.
//
// There is no supported alternative to remove it in favour of: initFromTuple, which does the actual
// work, is not exported, and @mionjs/run-types publishes no deep paths (only `.`, `./formats`,
// `./formats/temporal`, `./builders`, `./schema`). If upstream ever ships a tuple registrar outside
// the marker contract, this alias is what to replace. If instead its scanner starts resolving through
// local aliases, this line is what will fail PFN001 — swapping it for `getRTUtils().addPureFn` with a
// record projected off the tuple works too, and costs only the dep-closure walk (no mapper needs one
// today: every generated pure-fn tuple in this repo has an empty deps slot).
const registerPureFnUntracked = registerPureFn as unknown as (key: string, tuple: unknown) => unknown;

/** Registers a serverMapFrom mapper from RunTypes' own generated pure-fn tuple and opts the key
 *  into wire-reachability. Called by the generated `.mion/server-mappers.generated.js` in build mode,
 *  which imports the tuple straight from the client build's `__runtypes/types/pf/` tree — so the body
 *  has ONE source of truth and arrives with its real bodyHash, never a copy mion rehydrates. */
export function registerServerMapperTuple(key: string, tuple: unknown): void {
  if (!key || !Array.isArray(tuple)) {
    console.warn(`[mion serverMappers] mapper '${key}' has no generated pure-fn tuple — skipped.`);
    return;
  }
  registerPureFnUntracked(key, tuple);
  allowedMapperKeys.add(key);
}

/** One harvested serverMapFrom mapper (subset of the mion PureFnSite report record). */
export interface ServerMapperEntry {
  /** Full registry key, e.g. `rt::<contentHash>`. */
  key: string;
  paramNames?: string[];
  /** Factory body — rebuilt exactly like mion' own code-mode lane. */
  code?: string;
  pureFnDependencies?: string[];
}

/** Cross-instance store for the manifest re-reader (survives duplicated module instances). */
const mapperReaderStore = getOrCreateGlobal('mion.runTypes.serverMapperReader', () => ({
  read: undefined as (() => ServerMapperEntry[]) | undefined,
}));

/** Registers harvested mapper entries into the mion pure-fn cache (idempotent).
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
      // EMPTY, never the key's fn-name half. Upstream's `bodyHash` is a content hash of the
      // function BODY; mion's wire `bodyHash` (PureFnRef) is the full registry key — same name,
      // different things, and conflating them wrote a value that is neither. The manifest cannot
      // supply the real one: the pure-fn build report (PureFnSite) does not expose it.
      // Empty is the honest value AND the safe one — upstream's addPureFn only compares hashes
      // when both are non-empty, and on a mismatch it warns and REPLACES the existing entry. The
      // hasPureFnByKey guard above already returns before that can happen from here, so this was
      // never live; empty means it cannot become live if that guard ever moves.
      bodyHash: '',
      paramNames: entry.paramNames ?? [],
      code: entry.code,
      pureFnDependencies: entry.pureFnDependencies ?? [],
      // createPureFn deliberately ABSENT: mion' initPureFunction lazily rebuilds
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
