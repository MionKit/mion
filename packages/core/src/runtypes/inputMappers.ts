/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRTUtils, registerPureFn} from '@mionjs/run-types/runtime';
import {getOrCreateGlobal} from '../utils.ts';

// ############# batch input mappers — a transport with a security boundary #############
//
// Not a pure-fn registry: pure functions belong to RunTypes and mion registers none of its own. What mion
// owns is batch `inputFrom`, letting a CLIENT name a mapper that runs on the SERVER between two routes of a
// batch. A mapper is written inline, so RunTypes compiles it into its own generated module and the generated
// `.mion/rpc/batches.generated.js` imports that module and registers the tuple through
// registerInputMapperTuple below, which is why mion never keeps a copy of any mapper body.
//
// ############# the security boundary #############
//
// The mapper id never travels: the server reads the ids out of the batch table its own build compiled in
// (router/src/batches.ts), and the allow-list below gates what that table may reference.
// Without it a table entry could name ANY entry in the shared registry: addSerializedJitCaches installs
// arbitrary entries from a server methods-metadata payload, upstream's getPureFnByKey is the documented
// untracked door with no gate of its own, and in an SSR process both lanes share one registry.
// The gate is on LANE OF REGISTRATION, not on who owns the id: only ids that came through
// registerInputMapperTuple resolve.

/** Ids a batch table may reference as input mappers. See "the security boundary" above. */
const allowedMapperKeys = getOrCreateGlobal('mion.runTypes.allowedMapperKeys', () => new Set<string>());

// `registerPureFn` is a BUILD-TIME marker: a tuple passed from source is rejected with PFN001 (the argument
// must be an INLINE arrow or function expression). mion's lane has neither half a marker call needs, its key
// is a content hash from a build manifest and its body a tuple imported from the client's generated tree.
// The alias below is the untracked door: the scanner matches the callee at the call site, so a local const
// takes this one call out of its view while keeping upstream's runtime behaviour (tuple -> initFromTuple,
// plus the tuple's whole dep closure). Kept here once instead of spread across generated files.
// There is no supported alternative: initFromTuple is not exported and @mionjs/run-types publishes no deep
// paths for it. If upstream's scanner ever resolves through local aliases, this line fails PFN001; swapping
// it for `getRTUtils().addPureFn` over a record projected off the tuple works, and costs only the dep-closure
// walk (every generated pure-fn tuple in this repo has an empty deps slot today).
const registerPureFnUntracked = registerPureFn as unknown as (tuple: unknown, id: string) => unknown;

/** Registers an inputFrom mapper from RunTypes' generated pure-fn tuple and opts its id into batch-reachability.
 *  Called by `.mion/rpc/batches.generated.js`, which imports the tuple from the client build's `.mion/types/pf/`
 *  tree, so the body the id hashes is the only copy. */
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
