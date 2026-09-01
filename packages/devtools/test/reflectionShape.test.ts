// Reflection-AST shape suite (audit follow-up T8). Asserts the *shape* of the
// emitted `virtual:runtypes-cache` entries for representative kinds — coverage
// that was previously only incidental to the validate / serialization round-trips.
// Each structural scenario is paired (static getRunTypeId<T>() + reflect
// getRunTypeId(v)) per the marker coverage rule (CLAUDE.md); the literal-
// rehydration cases use the single form that actually captures the literal
// (generic inference widens literals in the other form — see atomic-types.md).
import {describe, expect} from 'vitest';
import {ReflectionKind} from '../src/core/protocol.ts';
import {evalCacheFor, getTypeFor, runTest} from './helpers/inline.ts';

type Cache = Parameters<typeof getTypeFor>[0];

describe('@mionjs/devtools / reflection-AST shape', () => {
  // ---- isCircular (T1) — self-referential object flags the canonical node ---
  function assertIsCircular(cache: Cache) {
    const root = getTypeFor(cache, 'm.ts');
    expect(root.kind).toBe(ReflectionKind.objectLiteral);
    expect(root.isCircular).toBe(true);
    const next = root.children?.find((m) => m.name === 'next');
    expect(next).toBeDefined();
    // next.child closes the cycle back onto the root id.
    expect(next!.child?.id).toBe(root.id);
  }
  const circularSrc = `interface C { val: number; next?: C }`;
  runTest(
    'isCircular: self-referential object [static]',
    {'m.ts': `import {getRunTypeId} from '@mionjs/run-types';\n${circularSrc}\ngetRunTypeId<C>();\n`},
    async (s) => assertIsCircular(await evalCacheFor(s))
  );
  runTest(
    'isCircular: self-referential object [reflect]',
    {
      'm.ts': `import {getRunTypeId} from '@mionjs/run-types';\n${circularSrc}\ndeclare const value: C;\ngetRunTypeId(value);\n`,
    },
    async (s) => assertIsCircular(await evalCacheFor(s))
  );

  // ---- typeMeta (T2) — atomic & { metadata } surfaces opaque metadata -------
  function assertTypeMeta(cache: Cache) {
    const root = getTypeFor(cache, 'm.ts');
    // The intersection collapses to the primitive; the metadata object is
    // lifted into typeMeta (NOT a structural member).
    expect(root.kind).toBe(ReflectionKind.number);
    expect(root.typeMeta).toBeDefined();
    expect(root.typeMeta!.length).toBe(1);
    const meta = root.typeMeta![0];
    expect(meta.kind).toBe(ReflectionKind.objectLiteral);
    const currency = meta.children?.find((m) => m.name === 'currency');
    expect(currency).toBeDefined();
    expect(currency!.child?.literal).toBe('USD');
  }
  const moneySrc = `type Money = number & {currency: 'USD'};`;
  runTest(
    'typeMeta: number & {currency} [static]',
    {'m.ts': `import {getRunTypeId} from '@mionjs/run-types';\n${moneySrc}\ngetRunTypeId<Money>();\n`},
    async (s) => assertTypeMeta(await evalCacheFor(s))
  );
  runTest(
    'typeMeta: number & {currency} [reflect]',
    {
      'm.ts': `import {getRunTypeId} from '@mionjs/run-types';\n${moneySrc}\ndeclare const value: Money;\ngetRunTypeId(value);\n`,
    },
    async (s) => assertTypeMeta(await evalCacheFor(s))
  );

  // ---- union — children + safeUnionChildren + discriminators ----------------
  function assertDiscriminatedUnion(cache: Cache) {
    const root = getTypeFor(cache, 'm.ts');
    expect(root.kind).toBe(ReflectionKind.union);
    expect(root.children?.length).toBe(2);
    expect(root.safeUnionChildren).toBeDefined();
    expect(root.safeUnionChildren!.length).toBe(2);
    // Both arms share the discriminator property `type`, so the detection
    // pass populates unionDiscriminators in parallel to safeUnionChildren.
    expect(root.unionDiscriminators).toBeDefined();
    const discNames = root.unionDiscriminators!.map((d) => d?.name);
    expect(discNames.every((n) => n === 'type')).toBe(true);
  }
  const unionSrc = `type U = {type: 'a'; x: number} | {type: 'b'; y: string};`;
  runTest(
    'union: discriminated [static]',
    {'m.ts': `import {getRunTypeId} from '@mionjs/run-types';\n${unionSrc}\ngetRunTypeId<U>();\n`},
    async (s) => assertDiscriminatedUnion(await evalCacheFor(s))
  );
  runTest(
    'union: discriminated [reflect]',
    {
      'm.ts': `import {getRunTypeId} from '@mionjs/run-types';\n${unionSrc}\ndeclare const value: U;\ngetRunTypeId(value);\n`,
    },
    async (s) => assertDiscriminatedUnion(await evalCacheFor(s))
  );

  // ---- Map — KindClass + subKind + key/value arguments ----------------------
  function assertMap(cache: Cache) {
    const root = getTypeFor(cache, 'm.ts');
    expect(root.kind).toBe(ReflectionKind.class);
    expect(root.subKind).toBeGreaterThan(0); // map subKind is set
    expect(root.arguments?.length).toBe(2); // key + value
  }
  runTest(
    'native: Map<string,number> [static]',
    {'m.ts': `import {getRunTypeId} from '@mionjs/run-types';\ngetRunTypeId<Map<string, number>>();\n`},
    async (s) => assertMap(await evalCacheFor(s))
  );
  runTest(
    'native: Map<string,number> [reflect]',
    {
      'm.ts': `import {getRunTypeId} from '@mionjs/run-types';\ndeclare const value: Map<string, number>;\ngetRunTypeId(value);\n`,
    },
    async (s) => assertMap(await evalCacheFor(s))
  );

  // ---- Set — KindClass + subKind + single item argument ---------------------
  function assertSet(cache: Cache) {
    const root = getTypeFor(cache, 'm.ts');
    expect(root.kind).toBe(ReflectionKind.class);
    expect(root.subKind).toBeGreaterThan(0); // set subKind is set
    expect(root.arguments?.length).toBe(1); // item
  }
  runTest(
    'native: Set<string> [static]',
    {'m.ts': `import {getRunTypeId} from '@mionjs/run-types';\ngetRunTypeId<Set<string>>();\n`},
    async (s) => assertSet(await evalCacheFor(s))
  );
  runTest(
    'native: Set<string> [reflect]',
    {
      'm.ts': `import {getRunTypeId} from '@mionjs/run-types';\ndeclare const value: Set<string>;\ngetRunTypeId(value);\n`,
    },
    async (s) => assertSet(await evalCacheFor(s))
  );

  // ---- enum — values + indexType --------------------------------------------
  function assertEnum(cache: Cache) {
    const root = getTypeFor(cache, 'm.ts');
    expect(root.kind).toBe(ReflectionKind.enum);
    expect(root.values?.length).toBe(2);
    expect(root.indexType).toBeDefined();
  }
  const enumSrc = `enum E { A, B }`;
  runTest(
    'enum: numeric [static]',
    {'m.ts': `import {getRunTypeId} from '@mionjs/run-types';\n${enumSrc}\ngetRunTypeId<E>();\n`},
    async (s) => assertEnum(await evalCacheFor(s))
  );
  runTest(
    'enum: numeric [reflect]',
    {
      'm.ts': `import {getRunTypeId} from '@mionjs/run-types';\n${enumSrc}\ndeclare const value: E;\ngetRunTypeId(value);\n`,
    },
    async (s) => assertEnum(await evalCacheFor(s))
  );

  // ---- tuple — member position + optional / rest flags ----------------------
  function assertTuple(cache: Cache) {
    const root = getTypeFor(cache, 'm.ts');
    expect(root.kind).toBe(ReflectionKind.tuple);
    expect(root.children?.length).toBe(3);
    expect(root.children![0].position).toBe(0);
    expect(root.children![1].position).toBe(1);
    expect(root.children![1].optional).toBe(true); // number?
    expect(root.children![2].flags).toContain('rest'); // ...boolean[]
  }
  runTest(
    'tuple: [string, number?, ...boolean[]] [static]',
    {'m.ts': `import {getRunTypeId} from '@mionjs/run-types';\ngetRunTypeId<[string, number?, ...boolean[]]>();\n`},
    async (s) => assertTuple(await evalCacheFor(s))
  );
  runTest(
    'tuple: [string, number?, ...boolean[]] [reflect]',
    {
      'm.ts': `import {getRunTypeId} from '@mionjs/run-types';\ndeclare const value: [string, number?, ...boolean[]];\ngetRunTypeId(value);\n`,
    },
    async (s) => assertTuple(await evalCacheFor(s))
  );

  // ---- class heritage — extends chain ---------------------------------------
  function assertHeritage(cache: Cache) {
    const root = getTypeFor(cache, 'm.ts');
    expect(root.kind).toBe(ReflectionKind.class);
    // B extends A → classes record the parent via extendsArguments
    // (interfaces use `extends`); inherited members flatten into children.
    expect(root.extendsArguments?.length).toBe(1);
    const names = (root.children ?? []).map((m) => m.name);
    expect(names).toContain('b'); // own member
    expect(names).toContain('a'); // inherited member, flattened in
  }
  const heritageSrc = `class A { a = 0 }\nclass B extends A { b = 0 }`;
  runTest(
    'class heritage: B extends A [static]',
    {'m.ts': `import {getRunTypeId} from '@mionjs/run-types';\n${heritageSrc}\ngetRunTypeId<B>();\n`},
    async (s) => assertHeritage(await evalCacheFor(s))
  );
  runTest(
    'class heritage: B extends A [reflect]',
    {
      'm.ts': `import {getRunTypeId} from '@mionjs/run-types';\n${heritageSrc}\ndeclare const value: B;\ngetRunTypeId(value);\n`,
    },
    async (s) => assertHeritage(await evalCacheFor(s))
  );

  // ---- template literal — projected as KindTemplateLiteral ------------------
  function assertTemplateLiteral(cache: Cache) {
    const root = getTypeFor(cache, 'm.ts');
    expect(root.kind).toBe(ReflectionKind.templateLiteral);
  }
  runTest(
    'templateLiteral: `api/${number}` [static]',
    {'m.ts': "import {getRunTypeId} from '@mionjs/run-types';\ngetRunTypeId<`api/${number}`>();\n"},
    async (s) => assertTemplateLiteral(await evalCacheFor(s))
  );
  runTest(
    'templateLiteral: `api/${number}` [reflect]',
    {
      'm.ts': "import {getRunTypeId} from '@mionjs/run-types';\ndeclare const value: `api/${number}`;\ngetRunTypeId(value);\n",
    },
    async (s) => assertTemplateLiteral(await evalCacheFor(s))
  );

  // ---- literal rehydration — bigint (static) -------------------------------
  // Single-form: generic inference widens this literal in the other form
  // (a `const v = 1n` widens to `bigint`).
  runTest(
    'literal: bigint 1n rehydrates to BigInt [static]',
    {'m.ts': `import {getRunTypeId} from '@mionjs/run-types';\ngetRunTypeId<1n>();\n`},
    async (s) => {
      const root = getTypeFor(await evalCacheFor(s), 'm.ts');
      expect(root.kind).toBe(ReflectionKind.literal);
      expect(typeof root.literal).toBe('bigint');
      expect(root.literal).toBe(1n);
    }
  );

  // ---- notSupported — non-data members kept in the tree but flagged ---------
  // serialize.go KEEPS the method signature in the reflected tree; the
  // cache-exit pass flags exactly that node `notSupported` and the runtime
  // rt() factory round-trips it. The data property stays unflagged. Emit
  // behaviour is unchanged.
  function assertNotSupported(cache: Cache) {
    const root = getTypeFor(cache, 'm.ts');
    expect(root.kind).toBe(ReflectionKind.objectLiteral);
    expect(root.notSupported).toBeFalsy();
    const a = root.children?.find((m) => m.name === 'a');
    expect(a).toBeDefined();
    expect(a!.notSupported).toBeFalsy();
    // The non-data method is KEPT (not dropped) and flagged notSupported.
    const greet = root.children?.find((m) => m.name === 'greet');
    expect(greet).toBeDefined();
    expect(greet!.kind).toBe(ReflectionKind.methodSignature);
    expect(greet!.notSupported).toBe(true);
  }
  const notSupportedSrc = `interface Mixed { a: string; greet(name: string): string }`;
  runTest(
    'notSupported: non-data method kept + flagged [static]',
    {'m.ts': `import {getRunTypeId} from '@mionjs/run-types';\n${notSupportedSrc}\ngetRunTypeId<Mixed>();\n`},
    async (s) => assertNotSupported(await evalCacheFor(s))
  );
  runTest(
    'notSupported: non-data method kept + flagged [reflect]',
    {
      'm.ts': `import {getRunTypeId} from '@mionjs/run-types';\n${notSupportedSrc}\ndeclare const value: Mixed;\ngetRunTypeId(value);\n`,
    },
    async (s) => assertNotSupported(await evalCacheFor(s))
  );
});
