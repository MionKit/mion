// End-to-end union round-trip tests. Mirrors the Go-side suite in
// internal/compiler/resolver/union_safeorder_test.go but exercises the full
// pipeline (rewrite → resolver → runTypeCacheSource → eval module → assert
// on the materialised RunType). The serialize-time analysis populates
// safeUnionChildren and unionDiscriminators on the union node — every
// scenario below pins down one of those wire-format outputs.
//
// Algorithm references:
//   - unionDiscriminator.ts (ref: packages/run-types/src): sortUnreachableTypes,
//     markDiscriminators, splitUnionItems
//   - Go port: internal/serialize/union_safeorder.go

import {describe, expect} from 'vitest';
import {ReflectionKind, type RunType} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, runTest} from './helpers/inline.ts';

describe('@ts-runtypes/devtools / union safe-order + discriminator round-trip', () => {
  // ---- safe-order: subset member gets sorted first ------------------------

  runTest(
    'subset member sorts after superset (1+2 props) static',
    {
      'subset.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {a: string} | {a: string; b: number};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertSubsetReorder(cache);
    }
  );

  runTest(
    'subset member sorts after superset (1+2 props) reflect',
    {
      'subset.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {a: string} | {a: string; b: number};
declare const value: T;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertSubsetReorder(cache);
    }
  );

  function assertSubsetReorder(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'subset.ts');
    expect(root.kind).toBe(ReflectionKind.union);
    expect(root.safeUnionChildren).toBeDefined();
    expect(root.safeUnionChildren!.length).toBe(2);
    // The first safe-order entry must be the 2-prop member.
    const first = root.safeUnionChildren![0];
    expect(first.children?.filter((m) => m.kind === ReflectionKind.propertySignature).length).toBe(2);
  }

  // ---- safe-order: deeper subset chain ------------------------------------

  runTest(
    'deep subset chain orders by prop count static',
    {
      'deep.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {a: string} | {a: string; b: number} | {a: string; b: number; c: boolean};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'deep.ts');
      expect(root.safeUnionChildren?.length).toBe(3);
      const sizes = (root.safeUnionChildren ?? []).map(
        (m) => m.children?.filter((c) => c.kind === ReflectionKind.propertySignature).length ?? 0
      );
      expect(sizes).toEqual([3, 2, 1]);
    }
  );

  // ---- safe-order: each child appears in safeUnionChildren ----------------
  // Canonical nodes are shared singletons in the emitted module so
  // per-member position is derived via `safeUnionChildren.indexOf(member)`
  // rather than stored on each ref.

  runTest(
    'each child has a slot in safeUnionChildren static',
    {
      'pos.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {a: string} | {a: string; b: number} | {x: boolean};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'pos.ts');
      expect(root.children?.length).toBe(3);
      expect(root.safeUnionChildren?.length).toBe(3);
      for (const child of root.children ?? []) {
        const slot = root.safeUnionChildren!.indexOf(child);
        expect(slot).toBeGreaterThanOrEqual(0);
        expect(root.safeUnionChildren![slot]).toBe(child);
      }
    }
  );

  // ---- discriminator: shared 'kind' field ---------------------------------

  runTest(
    'shared-name kind literal marked discriminator static',
    {
      'disc.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {kind: 'a'; x: number} | {kind: 'b'; y: string};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertDiscriminator(cache, 'kind', 2);
    }
  );

  runTest(
    'shared-name kind literal marked discriminator reflect',
    {
      'disc.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {kind: 'a'; x: number} | {kind: 'b'; y: string};
declare const value: T;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertDiscriminator(cache, 'kind', 2);
    }
  );

  // ---- discriminator: shared with non-distinct types is NOT marked --------

  runTest(
    'shared name but same type is not picked as discriminator static',
    {
      'shared.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {kind: string; x: 1} | {kind: string; y: 2};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'shared.ts');
      // shared-name pass must reject `kind` (same type-id across members).
      // Whatever fallback the unique-prop pass picks, it must not be `kind`.
      for (const disc of root.unionDiscriminators ?? []) {
        if (disc) expect(disc.name).not.toBe('kind');
      }
    }
  );

  // ---- discriminator: unique-prop fallback --------------------------------

  runTest(
    'no shared name falls back to unique-prop discriminator static',
    {
      'uniq.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {a: string} | {b: number};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'uniq.ts');
      const names = new Set<string>();
      for (const disc of root.unionDiscriminators ?? []) {
        if (disc?.name) names.add(disc.name);
      }
      expect(names.has('a')).toBe(true);
      expect(names.has('b')).toBe(true);
    }
  );

  // ---- discriminator: primitive-only union → no marks ---------------------

  runTest(
    'primitive-only union has no discriminator slot static',
    {
      'prim.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = string | number;
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'prim.ts');
      expect(root.unionDiscriminators).toBeUndefined();
    }
  );

  // ---- nested unions get flattened by Distributed() -----------------------

  runTest(
    'nested union flattens to a single 3-member union static',
    {
      'nested.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type Inner = 'a' | 'b';
type T = Inner | 'c';
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'nested.ts');
      expect(root.kind).toBe(ReflectionKind.union);
      expect(root.children?.length).toBe(3);
    }
  );

  // ---- union with null/undefined ------------------------------------------

  runTest(
    'union with null and undefined static',
    {
      'nullable.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = string | null | undefined;
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'nullable.ts');
      expect(root.kind).toBe(ReflectionKind.union);
      const kinds = (root.children ?? []).map((m) => m.kind);
      expect(kinds).toEqual(expect.arrayContaining([ReflectionKind.string, ReflectionKind.null, ReflectionKind.undefined]));
    }
  );

  // ---- union of arrays ----------------------------------------------------

  runTest(
    'union of arrays static',
    {
      'arrunion.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = string[] | number[];
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'arrunion.ts');
      expect(root.kind).toBe(ReflectionKind.union);
      const arrayMembers = (root.children ?? []).filter((m) => m.kind === ReflectionKind.array);
      expect(arrayMembers.length).toBe(2);
    }
  );

  // ---- unrelated objects keep declaration order in safe order ------------

  runTest(
    'unrelated objects keep declaration order static',
    {
      'unrel.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {a: string} | {b: number};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'unrel.ts');
      expect(root.safeUnionChildren?.length).toBe(2);
      // First entry should still be the {a:string} side.
      const firstNames = (root.safeUnionChildren![0].children ?? []).map((p) => p.name);
      expect(firstNames).toContain('a');
      const secondNames = (root.safeUnionChildren![1].children ?? []).map((p) => p.name);
      expect(secondNames).toContain('b');
    }
  );

  // ---- discriminator: per-union scoping (shared property must not bleed) --
  // Two unions reference structurally-identical `kind: 'a'` property
  // nodes. UA picks `kind` as a shared-name discriminator; UB rejects
  // it (same type-id across both members) and picks `aa` / `bb`
  // instead. Before the union-scoped discriminator slot, the mark
  // bled across the two unions via the shared property node.

  runTest(
    'discriminator info is scoped per-union (shared prop does not bleed)',
    {
      'iso.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type UA = {kind: 'a'; n: number} | {kind: 'b'; n: number};
type UB = {kind: 'a'; aa: string} | {kind: 'a'; bb: number};
getRunTypeId<UA>();
getRunTypeId<UB>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const unions = Object.values(cache.byHash).filter((t): t is RunType => t?.kind === ReflectionKind.union);
      expect(unions.length).toBe(2);
      const ua = unions.find((u) => u.unionDiscriminators?.some((d) => d?.name === 'kind'));
      const ub = unions.find((u) => u !== ua);
      expect(ua).toBeDefined();
      expect(ub).toBeDefined();
      // UA: every object member's discriminator slot points at 'kind'.
      const uaKindMarks = (ua!.unionDiscriminators ?? []).filter((d) => d?.name === 'kind').length;
      expect(uaKindMarks).toBe(2);
      // UB: no slot may point at 'kind' (unique-prop fallback picks aa / bb).
      for (const disc of ub!.unionDiscriminators ?? []) {
        if (disc) expect(disc.name).not.toBe('kind');
      }
    }
  );

  // ---- helper -------------------------------------------------------------

  function assertDiscriminator(cache: Parameters<typeof getTypeFor>[0], propName: string, expectedMarks: number): void {
    const root = getTypeFor(cache, 'disc.ts');
    let marks = 0;
    for (const disc of root.unionDiscriminators ?? []) {
      if (disc?.name === propName) marks++;
    }
    expect(marks).toBe(expectedMarks);
  }
});
