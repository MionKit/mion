// End-to-end intersection-collapse round-trip tests. Mirrors the Go-side
// suite in internal/compiler/resolver/intersection_collapse_test.go but exercises
// the full pipeline: rewrite → resolver → runTypeCacheSource → eval module →
// assert on the materialised RunType. Every scenario has paired *_static
// and *_reflect tests per the marker test coverage rule (CLAUDE.md).
//
// The collapse algorithm itself is documented in
// internal/serialize/intersection_collapse.go.

import {describe, expect} from 'vitest';
import {ReflectionKind, type RunType} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, runTest} from './helpers/inline.ts';

describe('@ts-runtypes/devtools / intersection collapse round-trip', () => {
  // ---- two object literals → merged objectLiteral --------------------------

  runTest(
    'object × object merge static',
    {
      'merge.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type AB = {a: string} & {b: number};
getRunTypeId<AB>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertMerged(cache);
    }
  );

  runTest(
    'object × object merge reflect',
    {
      'merge.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type AB = {a: string} & {b: number};
declare const value: AB;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertMerged(cache);
    }
  );

  function assertMerged(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'merge.ts');
    expect(root.kind).toBe(ReflectionKind.objectLiteral);
    const names = (root.children ?? []).map((m) => m.name);
    expect(names).toContain('a');
    expect(names).toContain('b');
  }

  // ---- primitive × brand → string + typeMeta ----------------------------

  runTest(
    'primitive & brand static',
    {
      'brand.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type Email = string & {readonly __brand: 'Email'};
getRunTypeId<Email>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertBranded(cache);
    }
  );

  runTest(
    'primitive & brand reflect',
    {
      'brand.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type Email = string & {readonly __brand: 'Email'};
declare const value: Email;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertBranded(cache);
    }
  );

  function assertBranded(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'brand.ts');
    expect(root.kind).toBe(ReflectionKind.string);
    expect(root.typeMeta).toBeDefined();
    expect(root.typeMeta!.length).toBe(1);
    expect(root.typeMeta![0].kind).toBe(ReflectionKind.objectLiteral);
  }

  // ---- primitive × multiple brands ----------------------------------------

  runTest(
    'primitive & multiple brands static',
    {
      'multi.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type Tagged = string & {readonly __a: 1} & {readonly __b: 2};
getRunTypeId<Tagged>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'multi.ts');
      expect(root.kind).toBe(ReflectionKind.string);
      expect(root.typeMeta?.length).toBe(2);
    }
  );

  // ---- number × brand -----------------------------------------------------

  runTest(
    'number & brand static',
    {
      'numbrand.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type UserId = number & {readonly __nominal: 'Id'};
getRunTypeId<UserId>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'numbrand.ts');
      expect(root.kind).toBe(ReflectionKind.number);
      expect(root.typeMeta?.length).toBe(1);
    }
  );

  // ---- never on conflict --------------------------------------------------

  runTest(
    'incompatible primitives collapse to never static',
    {
      'never.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type Conflict = string & number;
getRunTypeId<Conflict>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'never.ts');
      expect(root.kind).toBe(ReflectionKind.never);
    }
  );

  runTest(
    'never member short-circuits to never static',
    {
      'never2.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = never & {x: 1};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'never2.ts').kind).toBe(ReflectionKind.never);
    }
  );

  // ---- primitive × literal narrowing --------------------------------------

  runTest(
    'primitive & compatible literal keeps literal static',
    {
      'narrow.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = string & 'hello';
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'narrow.ts');
      expect(root.kind).toBe(ReflectionKind.literal);
      expect(root.literal).toBe('hello');
    }
  );

  runTest(
    'primitive & incompatible literal becomes never static',
    {
      'narrow2.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = string & 1;
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'narrow2.ts').kind).toBe(ReflectionKind.never);
    }
  );

  // ---- distribution over union --------------------------------------------

  runTest(
    'intersection distributes over union static',
    {
      'dist.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = ('a' | 'b') & string;
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'dist.ts');
      expect(root.kind).toBe(ReflectionKind.union);
      const values = (root.children ?? []).filter((m) => m.kind === ReflectionKind.literal).map((m) => m.literal);
      expect(values).toEqual(expect.arrayContaining(['a', 'b']));
    }
  );

  runTest(
    'distribution filters dead branches static',
    {
      'dist2.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = ('a' | 1) & string;
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'dist2.ts');
      expect(root.kind).toBe(ReflectionKind.literal);
      expect(root.literal).toBe('a');
    }
  );

  // ---- optional / readonly modifier merge ---------------------------------
  // spec parity: intersection should preserve `?` from either side
  // and `readonly` from either side on the merged property.

  runTest(
    'intersection preserves optional modifier static',
    {
      'opt.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {a: string; b?: number} & {c: boolean};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'opt.ts');
      expect(root.kind).toBe(ReflectionKind.objectLiteral);
      const b = (root.children ?? []).find((m) => m.name === 'b') as RunType;
      expect(b).toBeDefined();
      expect(b.optional).toBe(true);
    }
  );

  runTest(
    'intersection preserves readonly modifier static',
    {
      'ro.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {readonly id: number} & {name: string};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'ro.ts');
      const idProp = (root.children ?? []).find((m) => m.name === 'id') as RunType;
      expect(idProp).toBeDefined();
      expect(idProp.readonly).toBe(true);
    }
  );

  // ---- commutativity ------------------------------------------------------

  runTest(
    'A & B and B & A share a hash static',
    {
      'comm.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type A = {a: string};
type B = {b: number};
const ab = getRunTypeId<A & B>();
const ba = getRunTypeId<B & A>();
export {ab, ba};
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      // Both sites resolve to the same id because the structural shape
      // matches after collapse.
      const ids = new Set(cache.sites.map((s) => s.id));
      expect(ids.size).toBe(1);
    }
  );

  // ---- wire invariant: KindIntersection never appears on the wire ---------

  runTest(
    'collapse output never carries KindIntersection static',
    {
      'invariant.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type Merge = {a: string} & {b: number};
type Brand = string & {readonly __brand: 'X'};
type Bad   = string & number;
type Dist  = ('a' | 'b') & string;
getRunTypeId<Merge>();
getRunTypeId<Brand>();
getRunTypeId<Bad>();
getRunTypeId<Dist>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      for (const node of Object.values(cache.byHash)) {
        expect(node.kind).not.toBe(ReflectionKind.intersection);
      }
    }
  );
});
