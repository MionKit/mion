// End-to-end class / interface `extends` round-trip tests. Mirrors the
// Go-side suite in internal/compiler/resolver/extends_test.go and exercises the
// full pipeline: rewrite → resolver → runTypeCacheSource → eval module →
// assert on the materialised RunType.
//
// Wire fields covered:
//   - extendsArguments (classes) — direct parent class refs
//   - extends (interfaces) — direct parent interface refs
//   - children — flattened inherited + own members
//
// Paired *_static and *_reflect tests per the marker test coverage
// rule (CLAUDE.md).

import {describe, expect} from 'vitest';
import {ReflectionKind, type RunType} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, runTest} from './helpers/inline.ts';

describe('@ts-runtypes/devtools / extends round-trip', () => {
  // ---- class extends — populates extendsArguments + flattens members ------

  runTest(
    'class extends populates extendsArguments static',
    {
      'cext.ts': `import {getRunTypeId} from '@ts-runtypes/core';
class A { a = ''; }
class B extends A { b = 0; }
getRunTypeId<B>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertClassExtends(cache);
    }
  );

  runTest(
    'class extends populates extendsArguments reflect',
    {
      'cext.ts': `import {getRunTypeId} from '@ts-runtypes/core';
class A { a = ''; }
class B extends A { b = 0; }
declare const value: B;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertClassExtends(cache);
    }
  );

  function assertClassExtends(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'cext.ts');
    expect(root.kind).toBe(ReflectionKind.class);
    expect(root.extendsArguments?.length).toBe(1);
    const parent = root.extendsArguments![0];
    expect(parent.typeName).toBe('A');
    const names = (root.children ?? []).map((m) => m.name);
    expect(names).toContain('a');
    expect(names).toContain('b');
  }

  // ---- class chained inheritance ------------------------------------------

  runTest(
    'class chained inheritance static',
    {
      'chain.ts': `import {getRunTypeId} from '@ts-runtypes/core';
class A { a: string = ''; }
class B extends A { b: number = 0; }
class C extends B { c: boolean = false; }
getRunTypeId<C>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'chain.ts');
      // Direct parent on the wire is B; A is reachable transitively
      // via B.extendsArguments[0].
      expect(root.extendsArguments?.length).toBe(1);
      expect(root.extendsArguments![0].typeName).toBe('B');
      const names = (root.children ?? []).map((m) => m.name);
      for (const expected of ['a', 'b', 'c']) {
        expect(names).toContain(expected);
      }
    }
  );

  // ---- interface extends — populates extends ------------------------------

  runTest(
    'interface extends populates extends static',
    {
      'iext.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface A { a: string; }
interface B extends A { b: number; }
getRunTypeId<B>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertInterfaceExtends(cache);
    }
  );

  runTest(
    'interface extends populates extends reflect',
    {
      'iext.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface A { a: string; }
interface B extends A { b: number; }
declare const value: B;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertInterfaceExtends(cache);
    }
  );

  function assertInterfaceExtends(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'iext.ts');
    expect(root.kind).toBe(ReflectionKind.objectLiteral);
    expect(root.extends?.length).toBe(1);
    const parentRef = root.extends![0];
    expect(parentRef.kind).toBe(ReflectionKind.objectLiteral);
    // Inherited prop a + own prop b appear in children.
    const names = (root.children ?? []).map((m) => m.name);
    expect(names).toContain('a');
    expect(names).toContain('b');
  }

  // ---- interface multiple parents -----------------------------------------

  runTest(
    'interface multiple parents static',
    {
      'imulti.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface A { a: string; }
interface B { b: number; }
interface C extends A, B { c: boolean; }
getRunTypeId<C>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'imulti.ts');
      expect(root.extends?.length).toBe(2);
      const names = (root.children ?? []).map((m) => m.name);
      for (const expected of ['a', 'b', 'c']) {
        expect(names).toContain(expected);
      }
    }
  );

  // ---- diamond inheritance — inherited prop appears exactly once ---------

  runTest(
    'interface diamond inheritance static',
    {
      'diamond.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface A { a: string; }
interface B extends A { b: number; }
interface C extends A { c: boolean; }
interface D extends B, C { d: bigint; }
getRunTypeId<D>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'diamond.ts');
      expect(root.extends?.length).toBe(2);
      const names = (root.children ?? []).map((m) => m.name);
      const aOccurrences = names.filter((n) => n === 'a').length;
      expect(aOccurrences).toBe(1);
      for (const expected of ['a', 'b', 'c', 'd']) {
        expect(names).toContain(expected);
      }
    }
  );

  // ---- override: child narrows parent's prop ------------------------------

  runTest(
    'interface override narrows parent prop static',
    {
      'override.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface A { x: string; }
interface B extends A { x: 'a' | 'b'; }
getRunTypeId<B>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'override.ts');
      const xProp = (root.children ?? []).find((m) => m.name === 'x') as RunType;
      expect(xProp).toBeDefined();
      expect(xProp.child?.kind).toBe(ReflectionKind.union);
    }
  );

  // ---- type aliases / anonymous objects have no extends ------------------

  runTest(
    'type alias has no extends static',
    {
      'alias.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = {a: string};
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'alias.ts');
      expect(root.extends).toBeUndefined();
    }
  );

  runTest(
    'anonymous object literal has no extends static',
    {
      'anon.ts': `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<{a: string}>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'anon.ts');
      expect(root.extends).toBeUndefined();
    }
  );
});
