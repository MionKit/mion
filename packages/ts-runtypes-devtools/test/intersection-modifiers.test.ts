// End-to-end intersection × property modifier conflict round-trip
// tests. Mirrors the Go-side suite in
// internal/compiler/resolver/intersection_modifier_conflicts_test.go.
//
// These tests pin the TS checker's intersection modifier resolution
// rules to our wire format. If TS changes how it resolves these
// conflicts — or if our serialize path drops a flag — the test fails.

import {describe, expect} from 'vitest';
import {ReflectionKind, type RunType} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, runTest} from './helpers/inline.ts';

function findProp(root: RunType, name: string): RunType | undefined {
  return (root.children ?? []).find(
    (m) => (m.kind === ReflectionKind.property || m.kind === ReflectionKind.propertySignature) && m.name === name
  );
}

describe('@ts-runtypes/devtools / intersection × modifier conflict round-trip', () => {
  // ---- optional × required: required wins --------------------------------

  runTest(
    'optional & required → required wins static',
    {
      'opt.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {a?: string} & {a: string};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'opt.ts');
      const a = findProp(root, 'a');
      expect(a).toBeDefined();
      expect(a!.optional).toBeUndefined();
    }
  );

  runTest(
    'optional & required → required wins reflect',
    {
      'opt.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {a?: string} & {a: string};
declare const value: T;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'opt.ts');
      const a = findProp(root, 'a');
      expect(a!.optional).toBeUndefined();
    }
  );

  // ---- both sides match -------------------------------------------------

  runTest(
    'both optional → stays optional static',
    {
      'bo.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {a?: string} & {a?: string};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'bo.ts');
      expect(findProp(root, 'a')!.optional).toBe(true);
    }
  );

  runTest(
    'both required → stays required static',
    {
      'br.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {a: string} & {a: string};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'br.ts');
      expect(findProp(root, 'a')!.optional).toBeUndefined();
    }
  );

  // ---- readonly × writable: TS rule is "writable wins" -----------------
  // Per tsgo internal/checker/checker.go:21057-21060, intersection of
  // a readonly prop with a writable prop yields a writable prop.

  runTest(
    'readonly & writable → writable wins static',
    {
      'rw.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {readonly a: string} & {a: string};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'rw.ts');
      expect(findProp(root, 'a')!.readonly).toBeUndefined();
    }
  );

  runTest(
    'both readonly → stays readonly static',
    {
      'rr.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {readonly a: string} & {readonly a: string};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'rr.ts');
      expect(findProp(root, 'a')!.readonly).toBe(true);
    }
  );

  // ---- optional+readonly mix --------------------------------------------

  runTest(
    'readonly+optional & writable+required → required + writable static',
    {
      'mix.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {readonly a?: string} & {a: string};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'mix.ts');
      const a = findProp(root, 'a');
      // Required wins over optional; writable wins over readonly.
      expect(a!.optional).toBeUndefined();
      expect(a!.readonly).toBeUndefined();
    }
  );

  // ---- conflicting property types ---------------------------------------

  runTest(
    'conflicting types narrow to literal static',
    {
      'narrow.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {a: string} & {a: 'x'};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'narrow.ts');
      const a = findProp(root, 'a');
      expect(a!.child?.kind).toBe(ReflectionKind.literal);
      expect(a!.child?.literal).toBe('x');
    }
  );

  runTest(
    'incompatible types become never prop static',
    {
      'inc.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {a: string} & {a: number};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'inc.ts');
      const a = findProp(root, 'a');
      expect(a!.child?.kind).toBe(ReflectionKind.never);
    }
  );

  // ---- class visibility intersection (edge case) -----------------------

  runTest(
    'private+public class intersection does not crash static',
    {
      'cvi.ts': `import {getRunTypeId} from '@ts-runtypes/core';
class A { private x = 1; }
class B { x = 2; }
type T = A & B;
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      // No KindIntersection should leak to the wire.
      for (const node of Object.values(cache.byHash)) {
        expect(node.kind).not.toBe(ReflectionKind.intersection);
      }
    }
  );

  // ---- cross-form hash equivalence (marker coverage rule) ----------------

  // The same intersection reached via the static form in one file and the
  // reflect form in another collapses to a single cache entry — the
  // hash-equivalence assertion the marker coverage rule requires.
  runTest(
    'intersection static and reflect forms share one cache id',
    {
      'int_static.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {a?: string} & {a: string};
getRunTypeId<T>();
`,
      'int_reflect.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {a?: string} & {a: string};
declare const value: T;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const objects = Object.values(cache.byHash).filter((t) => (t.children ?? []).some((m) => m.name === 'a'));
      expect(objects.length).toBe(1);
    }
  );
});
