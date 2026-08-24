// End-to-end TypeScript utility-type round-trip tests. Mirrors the
// Go-side suite in internal/compiler/resolver/modifier_utilities_test.go.
//
// No serialize-side code knows about Required<T>/Readonly<T>/Partial<T>;
// the TS checker resolves them and we read the resulting symbol's flags
// via applyMemberModifiers (CheckFlagsMapped + AST modifiers). These
// tests confirm the wire shape reflects the post-mapped-type modifier
// state.

import {describe, expect} from 'vitest';
import {ReflectionKind, type RunType} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, runTest} from './helpers/inline.ts';

function findProp(root: RunType, name: string): RunType | undefined {
  return (root.children ?? []).find(
    (m) => (m.kind === ReflectionKind.property || m.kind === ReflectionKind.propertySignature) && m.name === name
  );
}

describe('@ts-runtypes/devtools / utility-type round-trip', () => {
  // ---- Required<T> --------------------------------------------------------

  runTest(
    'Required<T> strips optional static',
    {
      'req.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = Required<{a?: string; b?: number}>;
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'req.ts');
      for (const name of ['a', 'b']) {
        const prop = findProp(root, name);
        expect(prop).toBeDefined();
        expect(prop!.optional).toBeUndefined();
      }
    }
  );

  runTest(
    'Required<T> strips optional reflect',
    {
      'req.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = Required<{a?: string; b?: number}>;
declare const value: T;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'req.ts');
      for (const name of ['a', 'b']) {
        const prop = findProp(root, name);
        expect(prop).toBeDefined();
        expect(prop!.optional).toBeUndefined();
      }
    }
  );

  // ---- Partial<T> ---------------------------------------------------------

  runTest(
    'Partial<T> adds optional static',
    {
      'part.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = Partial<{a: string; b: number}>;
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'part.ts');
      for (const name of ['a', 'b']) {
        const prop = findProp(root, name);
        expect(prop).toBeDefined();
        expect(prop!.optional).toBe(true);
      }
    }
  );

  // ---- Readonly<T> --------------------------------------------------------

  runTest(
    'Readonly<T> adds readonly static',
    {
      'ro.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = Readonly<{a: string}>;
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'ro.ts');
      const a = findProp(root, 'a');
      expect(a).toBeDefined();
      expect(a!.readonly).toBe(true);
    }
  );

  runTest(
    'Readonly<T> preserves optional static',
    {
      'rop.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = Readonly<{a?: string}>;
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'rop.ts');
      const a = findProp(root, 'a');
      expect(a).toBeDefined();
      expect(a!.readonly).toBe(true);
      expect(a!.optional).toBe(true);
    }
  );

  // ---- Pick / Omit --------------------------------------------------------

  runTest(
    'Pick<T,K> keeps modifiers static',
    {
      'pick.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type S = {readonly a: string; b?: number};
type T = Pick<S, 'a'>;
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'pick.ts');
      const names = (root.children ?? []).map((m) => m.name);
      expect(names).toEqual(['a']);
      const a = findProp(root, 'a');
      expect(a!.readonly).toBe(true);
    }
  );

  runTest(
    'Omit<T,K> drops only the picked prop static',
    {
      'omit.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type S = {a: string; readonly b: number};
type T = Omit<S, 'a'>;
getRunTypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'omit.ts');
      const names = (root.children ?? []).map((m) => m.name);
      expect(names).toEqual(['b']);
      const b = findProp(root, 'b');
      expect(b!.readonly).toBe(true);
    }
  );

  // ---- user mapped types: -? / +? / -readonly / +readonly ----------------

  runTest(
    'user mapped type -? strips optional static',
    {
      'umr.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type Req<T> = {[P in keyof T]-?: T[P]};
type X = Req<{a?: string}>;
getRunTypeId<X>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'umr.ts');
      const a = findProp(root, 'a');
      expect(a!.optional).toBeUndefined();
    }
  );

  runTest(
    'user mapped type -readonly strips readonly static',
    {
      'umm.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type Mut<T> = {-readonly [P in keyof T]: T[P]};
type X = Mut<{readonly a: string}>;
getRunTypeId<X>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'umm.ts');
      const a = findProp(root, 'a');
      expect(a!.readonly).toBeUndefined();
    }
  );

  runTest(
    'user mapped type +? adds optional static',
    {
      'umo.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type Opt<T> = {[P in keyof T]+?: T[P]};
type X = Opt<{a: string}>;
getRunTypeId<X>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'umo.ts');
      const a = findProp(root, 'a');
      expect(a!.optional).toBe(true);
    }
  );

  runTest(
    'user mapped type +readonly adds readonly static',
    {
      'umro.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type RO<T> = {+readonly [P in keyof T]: T[P]};
type X = RO<{a: string}>;
getRunTypeId<X>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'umro.ts');
      const a = findProp(root, 'a');
      expect(a!.readonly).toBe(true);
    }
  );

  // ---- cross-form hash equivalence (marker coverage rule) ----------------

  // The same Required<T> reached via the static form in one file and the
  // reflect form in another collapses to a single cache entry — the
  // hash-equivalence assertion the marker coverage rule requires.
  runTest(
    'Required<T> static and reflect forms share one cache id',
    {
      'req_static.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = Required<{a?: string}>;
getRunTypeId<T>();
`,
      'req_reflect.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type T = Required<{a?: string}>;
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
