/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A pure walk over the cached graph, no store involved. A deploy rewrites a method's row with new
// hashes and leaves the old compiled functions behind with nothing pointing at them; this is what
// finds them, and what must never mistake a function that is still reachable for one of those.

import {describe, it, expect} from 'vitest';
import {getJitFnHashes, DEFAULT_ENCODER} from '@mionjs/core';
import type {CompiledFnData, MethodWithOptions} from '@mionjs/core';
import {findOrphans, type CacheGraph} from './metadataEviction.ts';

/** The hash a method's params validator is stored under, derived the way core derives it. */
function paramsIsTypeHash(jitHash: string): string {
  return getJitFnHashes(jitHash, DEFAULT_ENCODER.params).isType;
}

function method(id: string, paramsJitHash: string): MethodWithOptions {
  return {
    id,
    paramsJitHash,
    returnJitHash: '',
    paramsCount: 1,
    options: {},
  } as unknown as MethodWithOptions;
}

function dep(rtDependencies: string[] = [], pureFnDependencies: string[] = []): CompiledFnData {
  return {code: '', rtDependencies, pureFnDependencies} as unknown as CompiledFnData;
}

function graph(partial: Partial<CacheGraph>): CacheGraph {
  return {methods: {}, deps: {}, pureFns: {}, ...partial};
}

const ids = (keys: ReturnType<typeof findOrphans>) => keys.map(([kind, id]) => `${kind}:${id}`).sort();

describe('findOrphans', () => {
  it('keeps a function a live method points at', () => {
    const live = paramsIsTypeHash('h1');
    const orphans = findOrphans(graph({methods: {sayHello: method('sayHello', 'h1')}, deps: {[live]: dep()}}));
    expect(orphans).toEqual([]);
  });

  it('keeps a function only reachable through another function', () => {
    const live = paramsIsTypeHash('h1');
    const orphans = findOrphans(
      graph({
        methods: {sayHello: method('sayHello', 'h1')},
        deps: {[live]: dep(['nested']), nested: dep(['deeper']), deeper: dep()},
      })
    );
    expect(orphans).toEqual([]);
  });

  it('keeps a pure function reachable through a chain of pure functions', () => {
    const live = paramsIsTypeHash('h1');
    const orphans = findOrphans(
      graph({
        methods: {sayHello: method('sayHello', 'h1')},
        deps: {[live]: dep([], ['ns::first'])},
        pureFns: {'ns::first': {pureFnDependencies: ['ns::second']} as any, 'ns::second': {} as any},
      })
    );
    expect(orphans).toEqual([]);
  });

  it('drops what an older build left behind when the method moved to new hashes', () => {
    const live = paramsIsTypeHash('h2');
    const stale = paramsIsTypeHash('h1');
    const orphans = findOrphans(
      graph({
        // the row was rewritten in place with the new hash, the old functions were not
        methods: {sayHello: method('sayHello', 'h2')},
        deps: {[live]: dep(), [stale]: dep(['staleNested']), staleNested: dep([], ['ns::stale'])},
        pureFns: {'ns::stale': {} as any},
      })
    );
    expect(ids(orphans)).toEqual([`j:${stale}`, 'j:staleNested', 'p:ns::stale'].sort());
  });

  it('drops everything when no method is left', () => {
    const orphans = findOrphans(graph({deps: {lonely: dep()}, pureFns: {'ns::lonely': {} as any}}));
    expect(ids(orphans)).toEqual(['j:lonely', 'p:ns::lonely']);
  });

  it('survives a cycle between two functions', () => {
    const live = paramsIsTypeHash('h1');
    const orphans = findOrphans(
      graph({
        methods: {sayHello: method('sayHello', 'h1')},
        deps: {[live]: dep(['a']), a: dep(['b']), b: dep(['a'])},
      })
    );
    expect(orphans).toEqual([]);
  });
});
