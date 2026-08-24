// End-to-end class `implements` round-trip tests. Mirrors the Go-side
// suite in internal/compiler/resolver/implements_test.go. Implements is a
// compile-time contract — the runtime shape (children) is unaffected,
// but the implements slot lets consumers walk the contract list for
// codegen / docs.

import {describe, expect} from 'vitest';
import {ReflectionKind} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, runTest} from './helpers/inline.ts';

describe('@ts-runtypes/devtools / implements round-trip', () => {
  // ---- single interface ---------------------------------------------------

  runTest(
    'class implements single interface static',
    {
      'impl.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface I { a: string; }
class C implements I { a: string = ''; }
getRunTypeId<C>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertSingleImplements(cache);
    }
  );

  runTest(
    'class implements single interface reflect',
    {
      'impl.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface I { a: string; }
class C implements I { a: string = ''; }
declare const value: C;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertSingleImplements(cache);
    }
  );

  function assertSingleImplements(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'impl.ts');
    expect(root.kind).toBe(ReflectionKind.class);
    expect(root.implements?.length).toBe(1);
    const impl = root.implements![0];
    expect(impl.kind).toBe(ReflectionKind.objectLiteral);
  }

  // ---- multiple interfaces (order preserved) ------------------------------

  runTest(
    'class implements multiple interfaces static',
    {
      'multi.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface I1 { a: string; }
interface I2 { b: number; }
class C implements I1, I2 { a: string = ''; b: number = 0; }
getRunTypeId<C>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'multi.ts');
      expect(root.implements?.length).toBe(2);
      const firstNames = (root.implements![0].children ?? []).map((m) => m.name);
      expect(firstNames).toContain('a');
      const secondNames = (root.implements![1].children ?? []).map((m) => m.name);
      expect(secondNames).toContain('b');
    }
  );

  // ---- implements doesn't flatten contract members into the class -------

  runTest(
    'class implements does not flatten static',
    {
      'noflat.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface I { a: string; b: number; }
class C implements I {
  a: string = '';
  b: number = 0;
  c: boolean = false;
}
getRunTypeId<C>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'noflat.ts');
      const names = (root.children ?? []).map((m) => m.name);
      for (const expected of ['a', 'b', 'c']) {
        expect(names).toContain(expected);
      }
    }
  );

  // ---- extends AND implements both populate slots ------------------------

  runTest(
    'class extends and implements static',
    {
      'both.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface I { tag: 'i'; }
class B { x: string = ''; }
class C extends B implements I { tag: 'i' = 'i'; }
getRunTypeId<C>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'both.ts');
      expect(root.extendsArguments?.length).toBe(1);
      expect(root.implements?.length).toBe(1);
      const parent = root.extendsArguments![0];
      expect(parent.typeName).toBe('B');
    }
  );

  // ---- plain class has no implements slot --------------------------------

  runTest(
    'plain class has no implements slot static',
    {
      'plain.ts': `import {getRunTypeId} from '@ts-runtypes/core';
class C { x: string = ''; }
getRunTypeId<C>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'plain.ts');
      expect(root.implements ?? []).toHaveLength(0);
    }
  );
});
