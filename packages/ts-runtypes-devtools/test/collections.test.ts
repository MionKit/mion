// End-to-end collection-type round-trip tests. Mirrors members.test.ts's
// `evalCacheFor` + `getTypeFor` setup. Each scenario has paired static
// (getRunTypeId<T>()) and reflect (getRunTypeId(v)) tests per the
// marker test coverage rule (CLAUDE.md). Exercises the modifier and
// position fields the Go serializer populates: optional/readonly/
// visibility/abstract/static, isSafeName on properties/methods, and
// position on tuple members.

import {describe, expect} from 'vitest';
import {ReflectionKind, type RunType} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, runTest} from './helpers/inline.ts';

describe('@ts-runtypes/devtools / collection round-trip', () => {
  // ---- object literal: optional / readonly / unsafe prop name --------------
  //
  // The unsafe name is gnarly on purpose: a newline, `?>'`, a backslash, a
  // tab, and a CR — control chars that exercise JSON encoding, the source-
  // literal round-trip, and the safe-name regex.
  const weirdPropName = "weird prop name \n?>'\\\t\r";

  runTest(
    'object with optional+readonly+unsafe name static',
    {
      'obj.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface O {
  readonly id: number;
  nick?: string;
  "weird prop name \\n?>'\\\\\\t\\r": boolean;
}
getRunTypeId<O>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertObjectShapes(cache);
    }
  );

  runTest(
    'object with optional+readonly+unsafe name reflect',
    {
      'obj.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface O {
  readonly id: number;
  nick?: string;
  "weird prop name \\n?>'\\\\\\t\\r": boolean;
}
declare const value: O;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertObjectShapes(cache);
    }
  );

  function assertObjectShapes(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'obj.ts');
    expect(root.kind).toBe(ReflectionKind.objectLiteral);
    const id = root.children?.find((m) => m.name === 'id');
    expect(id).toBeDefined();
    expect(id!.readonly).toBe(true);
    expect(id!.isSafeName).toBe(true);
    expect(id!.optional).toBeUndefined();
    const nick = root.children?.find((m) => m.name === 'nick');
    expect(nick).toBeDefined();
    expect(nick!.optional).toBe(true);
    expect(nick!.isSafeName).toBe(true);
    expect(nick!.readonly).toBeUndefined();
    const weird = root.children?.find((m) => m.name === weirdPropName);
    expect(weird).toBeDefined();
    // Unsafe names: field is omitted on the wire so the consumer reads
    // undefined ≡ "needs bracket access".
    expect(weird!.isSafeName).toBeUndefined();
  }

  // ---- class: visibility / static / readonly --------------------------------

  runTest(
    'class with mixed property modifiers static',
    {
      'cls.ts': `import {getRunTypeId} from '@ts-runtypes/core';
class U {
  public id = 0;
  private secret = "";
  protected hint = 0;
  readonly tag = "t";
  static count = 0;
}
getRunTypeId<U>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertClassPropertyModifiers(cache);
    }
  );

  runTest(
    'class with mixed property modifiers reflect',
    {
      'cls.ts': `import {getRunTypeId} from '@ts-runtypes/core';
class U {
  public id = 0;
  private secret = "";
  protected hint = 0;
  readonly tag = "t";
  static count = 0;
}
declare const value: U;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertClassPropertyModifiers(cache);
    }
  );

  function assertClassPropertyModifiers(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'cls.ts');
    expect(root.kind).toBe(ReflectionKind.class);
    const id = root.children?.find((m) => m.name === 'id') as RunType;
    expect(id.visibility).toBe(0);
    const secret = root.children?.find((m) => m.name === 'secret') as RunType;
    expect(secret.visibility).toBe(2);
    const hint = root.children?.find((m) => m.name === 'hint') as RunType;
    expect(hint.visibility).toBe(1);
    const tag = root.children?.find((m) => m.name === 'tag') as RunType;
    expect(tag.readonly).toBe(true);
    const count = root.children?.find((m) => m.name === 'count') as RunType;
    expect(count.isStatic).toBe(true);
  }

  // ---- tuple: labeled / rest / optional / position -------------------------

  runTest(
    'labeled tuple with rest and optional static',
    {
      'tup.ts': `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<[a: number, b?: string, ...rest: boolean[]]>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertTupleLabeled(cache);
    }
  );

  runTest(
    'labeled tuple with rest and optional reflect',
    {
      'tup.ts': `import {getRunTypeId} from '@ts-runtypes/core';
declare const value: [a: number, b?: string, ...rest: boolean[]];
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertTupleLabeled(cache);
    }
  );

  function assertTupleLabeled(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'tup.ts');
    expect(root.kind).toBe(ReflectionKind.tuple);
    expect(root.children?.length).toBe(3);
    const [first, second, third] = root.children as RunType[];
    expect(first.name).toBe('a');
    expect(first.position).toBe(0);
    expect(second.name).toBe('b');
    expect(second.position).toBe(1);
    expect(second.optional).toBe(true);
    expect(third.position).toBe(2);
    expect(third.flags ?? []).toContain('rest');
  }

  // ---- index signature: readonly -------------------------------------------

  runTest(
    'readonly index signature static',
    {
      'idx.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface M {
  readonly [k: string]: number;
}
getRunTypeId<M>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertReadonlyIndexSignature(cache);
    }
  );

  runTest(
    'readonly index signature reflect',
    {
      'idx.ts': `import {getRunTypeId} from '@ts-runtypes/core';
interface M {
  readonly [k: string]: number;
}
declare const value: M;
getRunTypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertReadonlyIndexSignature(cache);
    }
  );

  function assertReadonlyIndexSignature(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'idx.ts');
    expect(root.kind).toBe(ReflectionKind.objectLiteral);
    const idx = root.children?.find((m) => m.kind === ReflectionKind.indexSignature);
    expect(idx).toBeDefined();
    expect(idx!.readonly).toBe(true);
    expect((idx!.index as RunType).kind).toBe(ReflectionKind.string);
    expect((idx!.child as RunType).kind).toBe(ReflectionKind.number);
  }
});
