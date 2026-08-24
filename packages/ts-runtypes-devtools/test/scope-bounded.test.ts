// JS-side regression test for the bounded-scope invariant — pins the
// contract that scanFiles + the rendered runtypes cache module contain
// ONLY types reachable from marker call sites, never any unreferenced
// type alias the file happens to declare.
//
// Tightens the Go-side TestScope_UnreferencedTypesAreNotProjected (in
// internal/compiler/resolver/perfile_test.go) with a full-pipeline assertion:
// the cache module body has to evaluate cleanly and its populated
// cache table must NOT carry any node for the unreferenced aliases.

import {describe, expect} from 'vitest';
import {ReflectionKind} from '../src/protocol.ts';
import {evalCacheFor, runTest} from './helpers/inline.ts';

describe('@ts-runtypes/devtools / bounded-scope contract', () => {
  runTest(
    'unreferenced type aliases do not appear in the rendered cache',
    {
      'scope.ts': `import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';

// Referenced — has a marker call; should be projected.
type Referenced = {a: string; b: number};

// Unreferenced — each carries a UNIQUE kind that Referenced doesn't
// touch, so a leak shows up as that kind appearing in the rendered
// cache.
type UnusedA = {x: bigint};                  // ReflectionKind.bigint
type UnusedB = {y: Date};                    // class with date subkind
export type UnusedC = boolean[];             // array of boolean

export const check = createValidateFn<Referenced>();
// Reflection demand — the runtype bundle is demand-driven on reflection
// sites; without this the rendered cache would be empty for this file.
getRunTypeId<Referenced>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const allKinds = new Set<number>();
      for (const node of Object.values(cache.byHash)) {
        if (node?.kind !== undefined && node.kind !== null) {
          allKinds.add(node.kind as number);
        }
      }
      // The marker-referenced shape {a: string; b: number} only uses
      // string, number, property, and object. None of these tell-tale
      // kinds should appear:
      expect(allKinds.has(ReflectionKind.bigint), 'UnusedA leaked (bigint found)').toBe(false);
      expect(allKinds.has(ReflectionKind.boolean), 'UnusedC leaked (boolean found)').toBe(false);
      expect(allKinds.has(ReflectionKind.array), 'UnusedC leaked (array found)').toBe(false);
      // Referenced's tell-tales must be present.
      expect(allKinds.has(ReflectionKind.string), 'Referenced not projected (no string)').toBe(true);
      expect(allKinds.has(ReflectionKind.number), 'Referenced not projected (no number)').toBe(true);
    }
  );
});
