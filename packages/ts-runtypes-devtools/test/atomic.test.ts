// End-to-end atomic round-trip tests. Each scenario has paired *_static
// and *_reflect tests per the marker test coverage rule (CLAUDE.md):
//   static  uses getRunTypeId<T>() — explicit type, no value
//   reflect uses getRunTypeId(v) — T inferred from a runtime value
//
// Per-test sequence is:
//   1. Spawn the Go binary with this test's inline source(s)
//   2. rewrite() to inject the trailing-InjectRunTypeId<T> id
//   3. Render a runtypes-cache JS module from the resolver dump
//   4. Eval the module and assert the resulting reflection-shape RunType
//      contains real runtime values where applicable (BigInt / Symbol /
//      RegExp / globalThis.Date instances)

import {describe, expect} from 'vitest';
import {ReflectionKind} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, runTest} from './helpers/inline.ts';

describe('@ts-runtypes/devtools / atomic round-trip', () => {
  // ---- primitives -------------------------------------------------------

  runTest(
    'string static',
    {
      'string.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<string>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'string.ts').kind).toBe(ReflectionKind.string);
    }
  );

  runTest(
    'string reflect',
    {
      'string.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v: string = 'hello';
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'string.ts').kind).toBe(ReflectionKind.string);
    }
  );

  runTest(
    'number static',
    {
      'number.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<number>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'number.ts').kind).toBe(ReflectionKind.number);
    }
  );

  runTest(
    'number reflect',
    {
      'number.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v: number = 42;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'number.ts').kind).toBe(ReflectionKind.number);
    }
  );

  runTest(
    'boolean static',
    {
      'boolean.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<boolean>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'boolean.ts').kind).toBe(ReflectionKind.boolean);
    }
  );

  runTest(
    'boolean reflect',
    {
      'boolean.ts': `import {getRunTypeId} from '@mionjs/run-types';
declare const v: boolean;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'boolean.ts').kind).toBe(ReflectionKind.boolean);
    }
  );

  runTest(
    'bigint static',
    {
      'bigint.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<bigint>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'bigint.ts').kind).toBe(ReflectionKind.bigint);
    }
  );

  runTest(
    'bigint reflect',
    {
      'bigint.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v: bigint = 1n;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'bigint.ts').kind).toBe(ReflectionKind.bigint);
    }
  );

  runTest(
    'symbol static',
    {
      'symbol.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<symbol>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'symbol.ts').kind).toBe(ReflectionKind.symbol);
    }
  );

  runTest(
    'symbol reflect',
    {
      'symbol.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v: symbol = Symbol('x');
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'symbol.ts').kind).toBe(ReflectionKind.symbol);
    }
  );

  runTest(
    'null static',
    {
      'null.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<null>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'null.ts').kind).toBe(ReflectionKind.null);
    }
  );

  runTest(
    'null reflect',
    {
      'null.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v: null = null;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'null.ts').kind).toBe(ReflectionKind.null);
    }
  );

  runTest(
    'undefined static',
    {
      'undefined.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<undefined>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'undefined.ts').kind).toBe(ReflectionKind.undefined);
    }
  );

  runTest(
    'undefined reflect',
    {
      'undefined.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v: undefined = undefined;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'undefined.ts').kind).toBe(ReflectionKind.undefined);
    }
  );

  runTest(
    'void static',
    {
      'void.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<void>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'void.ts').kind).toBe(ReflectionKind.void);
    }
  );

  runTest(
    'void reflect',
    {
      'void.ts': `import {getRunTypeId} from '@mionjs/run-types';
declare const v: void;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'void.ts').kind).toBe(ReflectionKind.void);
    }
  );

  runTest(
    'any static',
    {
      'any.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<any>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'any.ts').kind).toBe(ReflectionKind.any);
    }
  );

  runTest(
    'any reflect',
    {
      'any.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v: any = 1;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'any.ts').kind).toBe(ReflectionKind.any);
    }
  );

  runTest(
    'unknown static',
    {
      'unknown.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<unknown>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'unknown.ts').kind).toBe(ReflectionKind.unknown);
    }
  );

  runTest(
    'unknown reflect',
    {
      'unknown.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v: unknown = 1;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'unknown.ts').kind).toBe(ReflectionKind.unknown);
    }
  );

  runTest(
    'never static',
    {
      'never.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<never>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'never.ts').kind).toBe(ReflectionKind.never);
    }
  );

  runTest(
    'never reflect',
    {
      'never.ts': `import {getRunTypeId} from '@mionjs/run-types';
declare const v: never;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'never.ts').kind).toBe(ReflectionKind.never);
    }
  );

  runTest(
    'object primitive static',
    {
      'object.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<object>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'object.ts').kind).toBe(ReflectionKind.object);
    }
  );

  runTest(
    'object primitive reflect',
    {
      'object.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v: object = {};
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'object.ts').kind).toBe(ReflectionKind.object);
    }
  );

  // ---- regexp — instance form (no trace to a regex literal) -----------

  runTest(
    'regexp instance static (explicit RegExp type)',
    {
      'regexp.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<RegExp>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'regexp.ts').kind).toBe(ReflectionKind.regexp);
    }
  );

  runTest(
    'regexp instance reflect (declare const, no initializer)',
    {
      'regexp.ts': `import {getRunTypeId} from '@mionjs/run-types';
declare const re: RegExp;
getRunTypeId(re);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'regexp.ts').kind).toBe(ReflectionKind.regexp);
    }
  );

  // ---- literals ---------------------------------------------------------

  runTest(
    'literal string "hello" static',
    {
      'literal_string.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<'hello'>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'literal_string.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(t.literal).toBe('hello');
    }
  );

  runTest(
    'literal string "hello" reflect (as const)',
    {
      'literal_string.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v = 'hello' as const;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'literal_string.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(t.literal).toBe('hello');
    }
  );

  runTest(
    'literal string "hello" reflect (plain const) — widens to string',
    {
      'literal_string.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v = 'hello';
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'literal_string.ts').kind).toBe(ReflectionKind.string);
    }
  );

  runTest(
    'literal number 42 static',
    {
      'literal_number.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<42>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'literal_number.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(t.literal).toBe(42);
    }
  );

  runTest(
    'literal number 42 reflect (as const)',
    {
      'literal_number.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v = 42 as const;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'literal_number.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(t.literal).toBe(42);
    }
  );

  runTest(
    'literal number 42 reflect (plain const) — widens to number',
    {
      'literal_number.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v = 42;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'literal_number.ts').kind).toBe(ReflectionKind.number);
    }
  );

  runTest(
    'literal boolean true static',
    {
      'literal_boolean.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<true>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'literal_boolean.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(t.literal).toBe(true);
    }
  );

  runTest(
    'literal boolean true reflect (as const)',
    {
      'literal_boolean.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v = true as const;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'literal_boolean.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(t.literal).toBe(true);
    }
  );

  runTest(
    'literal boolean true reflect (plain const) — widens to boolean',
    {
      'literal_boolean.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v = true;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'literal_boolean.ts').kind).toBe(ReflectionKind.boolean);
    }
  );

  runTest(
    'literal bigint 1n -> real BigInt instance, static',
    {
      'literal_bigint.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<1n>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'literal_bigint.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(typeof t.literal).toBe('bigint');
      expect(t.literal).toBe(1n);
    }
  );

  runTest(
    'literal bigint 1n -> real BigInt instance, reflect (as const)',
    {
      'literal_bigint.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v = 1n as const;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'literal_bigint.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(typeof t.literal).toBe('bigint');
      expect(t.literal).toBe(1n);
    }
  );

  runTest(
    'literal bigint 1n reflect (plain const) — widens to bigint',
    {
      'literal_bigint.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v = 1n;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'literal_bigint.ts').kind).toBe(ReflectionKind.bigint);
    }
  );

  // Literal symbol: spelling a unique-symbol type still requires a value
  // binding (`typeof sym`); the static form goes through `typeof sym` in
  // the type argument, the reflect form passes the binding directly.
  runTest(
    'literal symbol -> real Symbol instance, static',
    {
      'literal_symbol.ts': `import {getRunTypeId} from '@mionjs/run-types';
const sym: unique symbol = Symbol('sym');
getRunTypeId<typeof sym>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'literal_symbol.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(typeof t.literal).toBe('symbol');
    }
  );

  runTest(
    'literal symbol -> real Symbol instance, reflect',
    {
      'literal_symbol.ts': `import {getRunTypeId} from '@mionjs/run-types';
const sym: unique symbol = Symbol('sym');
getRunTypeId(sym);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'literal_symbol.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(typeof t.literal).toBe('symbol');
      expect((t.literal as symbol).description).toBe('sym');
    }
  );

  // ---- enums ------------------------------------------------------------

  runTest(
    'numeric enum static -> values + enum object + indexType=number',
    {
      'enum_numeric.ts': `import {getRunTypeId} from '@mionjs/run-types';
enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
getRunTypeId<Color>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'enum_numeric.ts');
      expect(t.kind).toBe(ReflectionKind.enum);
      expect(t.typeName).toBe('Color');
      expect(t.enumVal).toEqual({Red: 0, Green: 1, Blue: 2});
      expect(t.values).toEqual(expect.arrayContaining([0, 1, 2]));
      expect(t.indexType?.kind).toBe(ReflectionKind.number);
    }
  );

  // `const v = Color.Red` (no annotation) widens to the parent enum `Color`.
  // The trap `const v: Color = …` narrows to the literal `Color.Red`.
  runTest(
    'numeric enum reflect -> values + enum object + indexType=number',
    {
      'enum_numeric.ts': `import {getRunTypeId} from '@mionjs/run-types';
enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
const v = Color.Red;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'enum_numeric.ts');
      expect(t.kind).toBe(ReflectionKind.enum);
      expect(t.typeName).toBe('Color');
      expect(t.enumVal).toEqual({Red: 0, Green: 1, Blue: 2});
      expect(t.values).toEqual(expect.arrayContaining([0, 1, 2]));
      expect(t.indexType?.kind).toBe(ReflectionKind.number);
    }
  );

  runTest(
    'string enum static -> values + indexType=string',
    {
      'enum_string.ts': `import {getRunTypeId} from '@mionjs/run-types';
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
getRunTypeId<Color>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'enum_string.ts');
      expect(t.kind).toBe(ReflectionKind.enum);
      expect(t.enumVal).toEqual({Red: 'red', Green: 'green', Blue: 'blue'});
      expect(t.indexType?.kind).toBe(ReflectionKind.string);
    }
  );

  runTest(
    'string enum reflect -> values + indexType=string',
    {
      'enum_string.ts': `import {getRunTypeId} from '@mionjs/run-types';
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
const v = Color.Red;
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'enum_string.ts');
      expect(t.kind).toBe(ReflectionKind.enum);
      expect(t.enumVal).toEqual({Red: 'red', Green: 'green', Blue: 'blue'});
      expect(t.indexType?.kind).toBe(ReflectionKind.string);
    }
  );

  // ---- Date — class with classType === globalThis.Date ----------------

  runTest(
    'Date class static -> classType === globalThis.Date',
    {
      'date.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<Date>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'date.ts');
      expect(t.kind).toBe(ReflectionKind.class);
      expect(t.typeName).toBe('Date');
      expect(t.classType).toBe(Date);
    }
  );

  runTest(
    'Date class reflect -> classType === globalThis.Date',
    {
      'date.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v: Date = new Date();
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'date.ts');
      expect(t.kind).toBe(ReflectionKind.class);
      expect(t.typeName).toBe('Date');
      expect(t.classType).toBe(Date);
    }
  );

  // ---- structural dedup at the wire level -----------------------------

  // One file uses the static form, the other the reflect form — both
  // produce the same `string` cache entry. This is the cross-form
  // hash-equivalence assertion required by the marker test coverage rule.
  runTest(
    'two `string` queries (mixed forms) in one program share a single cache id',
    {
      'string_a.ts': `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<string>();
`,
      'string_b.ts': `import {getRunTypeId} from '@mionjs/run-types';
const v: string = 'b';
getRunTypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const stringEntries = Object.values(cache.byHash).filter((t) => t.kind === ReflectionKind.string);
      expect(stringEntries.length).toBe(1);
    }
  );
});
