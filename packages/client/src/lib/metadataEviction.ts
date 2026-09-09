/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_ENCODER, EMPTY_HASH, getJitFnHashes, jsonStrategyOf} from '@mionjs/core';
import type {CompiledFnData, MethodWithOptions, PureFunctionData} from '@mionjs/core';
import type {MetadataRecordKey} from './storage.ts';

/** The stored cache as one graph: methods point at compiled functions by hash, and those point at
 *  each other. Everything already parsed by the hydrator, so the sweep costs no extra reads. */
export interface CacheGraph {
  /** by methodId */
  methods: Record<string, MethodWithOptions>;
  /** by compiled function hash */
  deps: Record<string, CompiledFnData>;
  /** by `${namespace}::${fnName}` */
  pureFns: Record<string, PureFunctionData>;
}

/** Every compiled function hash the method itself names, across both directions and both header sets. */
function methodRootHashes(metadata: MethodWithOptions): string[] {
  const encoder = metadata.options?.encoder ?? DEFAULT_ENCODER;
  const roots: string[] = [];
  // `true` asks for the binary pair too: a root is anything the method COULD reach, and a hash the
  // method never uses is simply absent from the store, which costs nothing here.
  const addSet = (jitHash: string, strategy: Parameters<typeof getJitFnHashes>[1]) => {
    if (!jitHash || jitHash === EMPTY_HASH) return;
    // the binary pair is optional on the returned shape, so only the real strings become roots
    for (const hash of Object.values(getJitFnHashes(jitHash, strategy, true)) as (string | undefined)[]) {
      if (typeof hash === 'string') roots.push(hash);
    }
  };
  addSet(metadata.paramsJitHash, jsonStrategyOf(encoder.params, 'params'));
  addSet(metadata.returnJitHash, jsonStrategyOf(encoder.return, 'return'));
  if (metadata.headersParam) addSet(metadata.headersParam.jitHash, 'mutate');
  if (metadata.headersReturn) addSet(metadata.headersReturn.jitHash, 'mutate');
  return roots;
}

/** The compiled functions no stored method can reach any more.
 *
 *  Hashes are content addresses, so an entry is never stale, only unreachable: a deploy rewrites a
 *  method's row with new hashes and the old ones are left behind with nothing pointing at them.
 *  This walks from the methods outwards and returns what the walk never touched. */
export function findOrphans(graph: CacheGraph): MetadataRecordKey[] {
  const reachedDeps = new Set<string>();
  const reachedPureFns = new Set<string>();
  const pending: string[] = [];

  for (const metadata of Object.values(graph.methods)) {
    for (const hash of methodRootHashes(metadata)) {
      if (graph.deps[hash] && !reachedDeps.has(hash)) {
        reachedDeps.add(hash);
        pending.push(hash);
      }
    }
  }

  const reachPureFn = (key: string) => {
    if (reachedPureFns.has(key)) return;
    reachedPureFns.add(key);
    for (const nested of graph.pureFns[key]?.pureFnDependencies ?? []) reachPureFn(nested);
  };

  while (pending.length) {
    const entry = graph.deps[pending.pop() as string];
    for (const hash of entry?.rtDependencies ?? []) {
      if (!graph.deps[hash] || reachedDeps.has(hash)) continue;
      reachedDeps.add(hash);
      pending.push(hash);
    }
    for (const key of entry?.pureFnDependencies ?? []) reachPureFn(key);
  }

  const orphans: MetadataRecordKey[] = [];
  for (const hash of Object.keys(graph.deps)) if (!reachedDeps.has(hash)) orphans.push(['j', hash]);
  for (const key of Object.keys(graph.pureFns)) if (!reachedPureFns.has(key)) orphans.push(['p', key]);
  return orphans;
}
