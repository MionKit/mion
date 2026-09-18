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
// A mapper is always written inline: the client writes `inputFrom(order, (o) => o.userId)`. The
// mapper carries the PureFunction/InjectPureFnId markers, so RunTypes compiles it into its OWN
// generated module and gives the call site the id of that registration. The mion preset harvests
// that site from the build report and records which ids the client's batches reference, plus
// where each one's generated module is. The generated `.mion/rpc/batches.generated.js` then
// IMPORTS those modules and registers each tuple through registerInputMapperTuple below, so mion
// never keeps a copy of any mapper body. Dev is no exception: the server entry imports that
// module, so a client rewrite of it is an ordinary vite change and the reload re-registers every
// tuple from the modules it names.
//
// ############# the security boundary #############
//
// The mapper id no longer travels: a batch request names a batch by id, and the server reads the
// mapper ids out of the batch table its own build compiled in (router/src/batches.ts). The
// allow-list below is the gate on what that table may reference. It stays load-bearing because
// the table is registered from a generated module, and because upstream's getPureFnByKey has no
// gate of its own: it is documented as the untracked door, which makes gating mion's job.
//
// Without the allow-list, a table entry could name ANY entry in the shared registry. That is not
// hypothetical: mionAdapter's addSerializedJitCaches installs arbitrary entries out of a server
// methods-metadata payload and never touches this set, so in an SSR process both lanes share one
// registry. RunTypes' own pure fns and anything registered by an unrelated library in the same
// process are reachable too.
//
// The gate is on LANE OF REGISTRATION, not on who owns the id: only ids that came through
// registerInputMapperTuple resolve.

/** Ids a batch table may reference as input mappers. See "the security boundary" above. */
const allowedMapperKeys = getOrCreateGlobal('mion.runTypes.allowedMapperKeys', () => new Set<string>());

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
const registerPureFnUntracked = registerPureFn as unknown as (tuple: unknown, id: string) => unknown;

/** Registers an inputFrom mapper from RunTypes' own generated pure-fn tuple and opts its id
 *  into batch-reachability. Called by the generated `.mion/rpc/batches.generated.js`, which
 *  imports the tuple straight from the client build's `.mion/types/pf/` tree — so the body has
 *  ONE source of truth and arrives with its real bodyHash, never a copy mion rehydrates. */
export function registerInputMapperTuple(id: string, tuple: unknown): void {
  if (!id || !Array.isArray(tuple)) {
    console.warn(`[mion inputMappers] mapper '${id}' has no generated pure-fn tuple — skipped.`);
    return;
  }
  registerPureFnUntracked(tuple, id);
  allowedMapperKeys.add(id);
}

/** Resolves a batch mapping's mapper by its pure-fn id. Gated on the allow-list: a table id never
 *  resolves a registry entry that no mion lane opted in. */
export function getInputMapper(id: string): ((...args: any[]) => any) | undefined {
  if (!allowedMapperKeys.has(id)) return undefined;
  return getRTUtils().getPureFnByKey(id);
}

/** True when a batch mapping's mapper id resolves. */
export function hasInputMapper(id: string): boolean {
  return getInputMapper(id) !== undefined;
}
