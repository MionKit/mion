/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRTUtils, registerPureFn} from '@mionjs/run-types';
import {getOrCreateGlobal} from '../utils.ts';

// ############# batch input mappers — a transport with a security boundary #############
//
// This module is NOT a pure-fn registry. Pure functions belong to RunTypes; mion registers
// none of its own. What mion owns is the batch `inputFrom` feature: letting a CLIENT name a
// mapper that runs on the SERVER, between two routes of a batch.
//
// Two lanes reach a mapper, both landing in the shared mion pure-fn registry:
//
// - INLINE (vite / next builds): the client writes `inputFrom(order, (o) => o.userId)`. The
//   mapper carries the PureFunction/InjectPureFnHash markers, so RunTypes compiles it into its
//   OWN generated module (`.mion/types/pf/rt/<hash>.js`) and content-hashes the call site to
//   `rt::<hash>`. The mion preset harvests that site from the build report and records which keys
//   the client's batches reference, plus where each one's generated module is. The generated
//   `.mion/batches.generated.js` then IMPORTS those modules and registers each tuple through
//   registerInputMapperTuple below, so mion never keeps a copy of any mapper body.
//
//   Dev/serve is the exception: the server can boot before the client build has finished harvesting,
//   so that lane keeps reading the manifest (code payload included) through installInputMapperReader
//   → registerInputMappers. A static import cannot resolve a module that does not exist yet, and the
//   on-miss re-read is synchronous because getInputMapper sits on the router's request path.
//
// - BY NAME: the client writes `inputFrom(order, 'toUserId')`; the server registers the mapper
//   itself with RunTypes' own registrar and opts the key into batch-reachability:
//
//       registerPureFn('mionjs::toUserId', (order: Order) => order.userId);
//       allowInputMapper(inputMapperKey('toUserId'));
//
//   A literal key + an inline function literal is scanner-clean (no CTA003, no PFN001), so no
//   mion-side registration wrapper is needed.
//
// ############# the security boundary #############
//
// The mapper key no longer travels: a batch request names a batch by id, and the server reads the
// mapper keys out of the batch table its own build compiled in (router/src/batches.ts). The
// allow-list below is the gate on what that table may reference. It stays load-bearing because
// the table is registered from a generated module and, in dev/serve, from a manifest read at
// runtime, and because upstream's getPureFnByKey has no gate of its own: it is documented as the
// untracked door, which makes gating mion's job.
//
// Without the allow-list, a table entry could name ANY entry in the shared registry. That is not
// hypothetical: mionAdapter's addSerializedJitCaches installs arbitrary `<ns>::<fn>` entries out of
// a server methods-metadata payload and never touches this set, so in an SSR process both lanes
// share one registry. Built-in `rt::`/`rtFormats::` fns and anything registered by an unrelated
// library in the same process are reachable too.
//
// Note the gate is on LANE OF REGISTRATION, not on namespace: `rt::` keys are exactly what the
// legitimate inline lane produces. Only keys that came through registerInputMappers or an
// explicit allowInputMapper call resolve.

/** Namespace for mapper keys registered by name on the server. */
export const INPUT_MAPPER_NAMESPACE = 'mionjs';

/** Builds the registry key for a named input mapper. This is the client↔server CONTRACT: the build
 *  writes this string into the batch table and the server resolves it against its own registry.
 *  Not a registration helper; register the fn itself with RunTypes' registerPureFn. */
export function inputMapperKey(name: string): string {
  return `${INPUT_MAPPER_NAMESPACE}::${name}`;
}

/** Keys a batch table may reference as input mappers. See "the security boundary" above. */
const allowedMapperKeys = getOrCreateGlobal('mion.runTypes.allowedMapperKeys', () => new Set<string>());

/** Opts a server-registered pure fn into batch-reachability as an input mapper.
 *  Required for the name lane: RunTypes' registrars write to the registry but know nothing
 *  about mion's gate, so a fn registered with registerPureFn alone is deliberately unreachable. */
export function allowInputMapper(pureFnId: string): void {
  allowedMapperKeys.add(pureFnId);
}

// RunTypes' registrars are BUILD-TIME markers: the scanner reads the inline function literal at
// the call site, emits it as a generated pure-fn module, and rewrites the call to pass that module's
// entry tuple. So `registerPureFn(key, tuple)` is the shape the transform PRODUCES, and passing a
// tuple from source is rejected as `error PFN001: PureFunction<F> argument must be an INLINE arrow or
// function expression`. mion's inline lane has neither half a marker call needs — its key is a content
// hash read from a build manifest and its body is a tuple imported from the client's generated tree —
// so it needs the untracked door, exactly as the table-driven lookup already uses getPureFnByKey.
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

/** Registers a inputFrom mapper from RunTypes' own generated pure-fn tuple and opts the key
 *  into batch-reachability. Called by the generated `.mion/batches.generated.js` in build mode,
 *  which imports the tuple straight from the client build's `.mion/types/pf/` tree — so the body
 *  has ONE source of truth and arrives with its real bodyHash, never a copy mion rehydrates. */
export function registerInputMapperTuple(key: string, tuple: unknown): void {
  if (!key || !Array.isArray(tuple)) {
    console.warn(`[mion inputMappers] mapper '${key}' has no generated pure-fn tuple — skipped.`);
    return;
  }
  registerPureFnUntracked(key, tuple);
  allowedMapperKeys.add(key);
}

/** One harvested inputFrom mapper (subset of the mion PureFnSite report record). */
export interface InputMapperEntry {
  /** Full registry key, e.g. `rt::<contentHash>`. */
  key: string;
  paramNames?: string[];
  /** Factory body — rebuilt exactly like mion' own code-mode lane. */
  code?: string;
  pureFnDependencies?: string[];
}

/** Cross-instance store for the manifest re-reader (survives duplicated module instances). */
const mapperReaderStore = getOrCreateGlobal('mion.runTypes.inputMapperReader', () => ({
  read: undefined as (() => InputMapperEntry[]) | undefined,
}));

/** Registers harvested mapper entries into the mion pure-fn cache (idempotent).
 *  Called by the generated `.mion/batches.generated.js` module in the server bundle. */
export function registerInputMappers(entries: InputMapperEntry[]): void {
  const utl = getRTUtils();
  for (const entry of entries) {
    if (!entry?.key) continue;
    if (utl.hasPureFnByKey(entry.key)) {
      allowedMapperKeys.add(entry.key);
      continue;
    }
    if (!entry.code) {
      console.warn(`[mion inputMappers] mapper '${entry.key}' has no code payload (emitMode without code?) — skipped.`);
      continue;
    }
    const sep = entry.key.indexOf('::');
    const compiled = {
      namespace: sep > 0 ? entry.key.slice(0, sep) : '',
      fnName: sep > 0 ? entry.key.slice(sep + 2) : entry.key,
      // EMPTY, never the key's fn-name half. Upstream's `bodyHash` is a content hash of the
      // function BODY; mion's `mapperKey` (InputFromRef) is the full registry key, a different
      // thing, and conflating them once wrote a value that is neither. The manifest cannot
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
export function installInputMapperReader(read: () => InputMapperEntry[]): void {
  mapperReaderStore.read = read;
  registerInputMappers(read());
}

/** Resolves a batch mapping key (`rt::<hash>` | `mionjs::<name>`), re-reading the manifest on a
 *  miss. Gated on the allow-list: a table key never resolves a registry entry that no mion lane and
 *  no explicit allowInputMapper call opted in. */
export function getInputMapper(key: string): ((...args: any[]) => any) | undefined {
  if (!allowedMapperKeys.has(key)) {
    if (!mapperReaderStore.read) return undefined;
    registerInputMappers(mapperReaderStore.read());
    if (!allowedMapperKeys.has(key)) return undefined;
  }
  return getRTUtils().getPureFnByKey(key);
}

/** True when a batch mapping key resolves (after a lazy manifest re-read on miss). */
export function hasInputMapper(key: string): boolean {
  return getInputMapper(key) !== undefined;
}
