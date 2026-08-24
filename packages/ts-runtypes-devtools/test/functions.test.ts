// Function-family round-trip tests. Mirrors the Go function_test.go cases
// (F35–F40). Each scenario has paired static (getRunTypeId<T>()) and
// reflect (getRunTypeId(v)) tests per the marker test coverage rule
// (CLAUDE.md). The shared assertion helpers walk parameters and return
// after the virtual cache evaluates.
//
// F40 (callSignature in mixed object) ships static-only — constructing a
// callable-with-properties value at the source level is awkward; the Go
// side covers the marker.Detect parity.

import {describe, expect} from 'vitest';
import {ReflectionKind, type RunType} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, runTest} from './helpers/inline.ts';

describe('@ts-runtypes/devtools / function round-trip', () => {
  // ---- rest-only function --------------------------------------------------

  runTest(
    'rest-only function static',
    {
      'rest.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type Fn = (...args: string[]) => void;
getRunTypeId<Fn>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertRestOnly(cache);
    }
  );

  runTest(
    'rest-only function reflect',
    {
      'rest.ts': `import {getRunTypeId} from '@ts-runtypes/core';
function fn(...args: string[]): void {}
getRunTypeId(fn);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertRestOnly(cache);
    }
  );

  function assertRestOnly(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'rest.ts');
    expect(root.kind).toBe(ReflectionKind.function);
    expect(root.parameters?.length).toBe(1);
    const param = root.parameters![0];
    expect(param.kind).toBe(ReflectionKind.parameter);
    expect(param.name).toBe('args');
    expect(param.position).toBe(0);
    expect(param.flags).toContain('rest');
    const child = param.child as RunType;
    expect(child.kind).toBe(ReflectionKind.array);
    expect((child.child as RunType).kind).toBe(ReflectionKind.string);
    expect((root.return as RunType).kind).toBe(ReflectionKind.void);
  }

  // ---- mixed function (positional + optional + rest + string return) -------

  runTest(
    'mixed function static',
    {
      'mixed.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type Fn = (a: number, b?: string, ...rest: boolean[]) => string;
getRunTypeId<Fn>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertMixed(cache);
    }
  );

  runTest(
    'mixed function reflect',
    {
      'mixed.ts': `import {getRunTypeId} from '@ts-runtypes/core';
function fn(a: number, b?: string, ...rest: boolean[]): string { return ""; }
getRunTypeId(fn);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertMixed(cache);
    }
  );

  function assertMixed(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'mixed.ts');
    expect(root.kind).toBe(ReflectionKind.function);
    expect(root.parameters?.length).toBe(3);

    const a = root.parameters![0];
    expect(a.name).toBe('a');
    expect(a.position).toBe(0);
    expect(a.optional).toBeUndefined();
    expect(a.flags ?? []).not.toContain('rest');
    expect((a.child as RunType).kind).toBe(ReflectionKind.number);

    const b = root.parameters![1];
    expect(b.name).toBe('b');
    expect(b.position).toBe(1);
    expect(b.optional).toBe(true);
    expect((b.child as RunType).kind).toBe(ReflectionKind.string);

    const rest = root.parameters![2];
    expect(rest.name).toBe('rest');
    expect(rest.position).toBe(2);
    expect(rest.flags).toContain('rest');
    const restArr = rest.child as RunType;
    expect(restArr.kind).toBe(ReflectionKind.array);
    expect((restArr.child as RunType).kind).toBe(ReflectionKind.boolean);

    expect((root.return as RunType).kind).toBe(ReflectionKind.string);
  }

  // ---- function with Promise<object> return --------------------------------

  runTest(
    'promise return static',
    {
      'promise.ts': `import {getRunTypeId} from '@ts-runtypes/core';
type Fn = (x: number) => Promise<{ok: boolean}>;
getRunTypeId<Fn>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertPromiseReturn(cache);
    }
  );

  runTest(
    'promise return reflect',
    {
      'promise.ts': `import {getRunTypeId} from '@ts-runtypes/core';
async function fn(x: number): Promise<{ok: boolean}> { return {ok: true}; }
getRunTypeId(fn);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertPromiseReturn(cache);
    }
  );

  function assertPromiseReturn(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'promise.ts');
    expect(root.kind).toBe(ReflectionKind.function);
    expect(root.parameters?.length).toBe(1);
    expect(root.parameters![0].name).toBe('x');
    const ret = root.return as RunType;
    expect(ret.kind).toBe(ReflectionKind.promise);
    const resolved = ret.child as RunType;
    expect(resolved.kind).toBe(ReflectionKind.objectLiteral);
    const ok = resolved.children?.find((m) => m.name === 'ok');
    expect(ok).toBeDefined();
    expect((ok!.child as RunType).kind).toBe(ReflectionKind.boolean);
  }

  // ---- class method full shape ---------------------------------------------

  runTest(
    'class method full shape static',
    {
      'svc.ts': `import {getRunTypeId} from '@ts-runtypes/core';
class Service {
  greet(name: string, opts?: {tag: string}): string { return ""; }
}
getRunTypeId<Service>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertClassMethod(cache);
    }
  );

  runTest(
    'class method full shape reflect',
    {
      'svc.ts': `import {getRunTypeId} from '@ts-runtypes/core';
class Service {
  greet(name: string, opts?: {tag: string}): string { return ""; }
}
declare const value: Service;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertClassMethod(cache);
    }
  );

  function assertClassMethod(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'svc.ts');
    expect(root.kind).toBe(ReflectionKind.class);
    const greet = root.children?.find((m) => m.name === 'greet');
    expect(greet).toBeDefined();
    expect(greet!.kind).toBe(ReflectionKind.method);
    expect(greet!.parameters?.length).toBe(2);
    const name = greet!.parameters![0];
    expect(name.name).toBe('name');
    expect(name.position).toBe(0);
    expect((name.child as RunType).kind).toBe(ReflectionKind.string);
    const opts = greet!.parameters![1];
    expect(opts.name).toBe('opts');
    expect(opts.position).toBe(1);
    expect(opts.optional).toBe(true);
    const optsObj = opts.child as RunType;
    expect(optsObj.kind).toBe(ReflectionKind.objectLiteral);
    const tag = optsObj.children?.find((m) => m.name === 'tag');
    expect(tag).toBeDefined();
    expect((tag!.child as RunType).kind).toBe(ReflectionKind.string);
    expect((greet!.return as RunType).kind).toBe(ReflectionKind.string);
  }

  // ---- interface method-signature full shape -------------------------------

  runTest(
    'method signature full shape static',
    {
      'i.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface I { greet(name: string): string; }
getRunTypeId<I>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertMethodSignature(cache);
    }
  );

  runTest(
    'method signature full shape reflect',
    {
      'i.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface I { greet(name: string): string; }
declare const value: I;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertMethodSignature(cache);
    }
  );

  function assertMethodSignature(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'i.ts');
    expect(root.kind).toBe(ReflectionKind.objectLiteral);
    const greet = root.children?.find((m) => m.name === 'greet');
    expect(greet).toBeDefined();
    expect(greet!.kind).toBe(ReflectionKind.methodSignature);
    expect(greet!.parameters?.length).toBe(1);
    const name = greet!.parameters![0];
    expect(name.name).toBe('name');
    expect(name.position).toBe(0);
    expect((name.child as RunType).kind).toBe(ReflectionKind.string);
    expect((greet!.return as RunType).kind).toBe(ReflectionKind.string);
  }

  // ---- call signature in mixed object (static only) ------------------------

  runTest(
    'callSignature in mixed object static',
    {
      'tag.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface Tagged { (x: number): string; tag: "tagged"; }
getRunTypeId<Tagged>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'tag.ts');
      expect(root.kind).toBe(ReflectionKind.objectLiteral);
      const callSig = root.children?.find((m) => m.kind === ReflectionKind.callSignature);
      expect(callSig).toBeDefined();
      expect(callSig!.parameters?.length).toBe(1);
      const x = callSig!.parameters![0];
      expect(x.name).toBe('x');
      expect(x.position).toBe(0);
      expect((x.child as RunType).kind).toBe(ReflectionKind.number);
      expect((callSig!.return as RunType).kind).toBe(ReflectionKind.string);
      const tag = root.children?.find((m) => m.name === 'tag');
      expect(tag).toBeDefined();
      const tagChild = tag!.child as RunType;
      expect(tagChild.kind).toBe(ReflectionKind.literal);
      expect(tagChild.literal).toBe('tagged');
    }
  );
});
