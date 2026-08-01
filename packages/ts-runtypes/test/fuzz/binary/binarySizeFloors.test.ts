// Deterministic reserve-floor regressions for the binary cold-start estimate —
// the cases the random size lane (binarySizeEstimate) samples but CI should always
// check. Two groups:
//
//   1. Part-A packed formats: an in-bounds value over a packed-format type encodes
//      at the packed-width seed without growing (revert the scalar-number reserve
//      to 8 in binary_to.go and these go red).
//   2. Reserve floors: the type-constrained / variable-content cases the reserve
//      audit's refutations named — string keys/values, bigints, regexp, unions,
//      enums, nesting — compiled at an ADVERSARIAL tiny config (items=2,
//      stringBytes=1) where a too-low estimate or too-loose mock bound resizes the
//      cold buffer. A `respectBinarySize:true` value must fit by construction.
//
// Format brands use the local `TypeFormat` decl the resolver recognises (mirrors
// internal/compiler/resolver's typeFormatBrandDecl).

import path from 'node:path';
import {describe, it, expect} from 'vitest';
import {createBinaryEncoderFn, createBinaryDecoderFn, createBinarySizerFn, createMockDataFn} from '@ts-runtypes/core';
import {ResolverClient} from '../../../../ts-runtypes-devtools/src/resolver-client.ts';
import type {BinarySizingOptions} from '../../../src/mocking/mockTypes.ts';
import {
  RUNTYPES_DTS,
  evalEntryModules,
  instantiateRunTypes,
  BIN,
  hasBinary,
} from '../../../../ts-runtypes-devtools/test/helpers/inline.ts';
import {Severity} from '../../../../ts-runtypes-devtools/src/protocol.ts';
import {setSerializationOptions} from '../../../src/runtypes/dataView.ts';
import {binarySizeEstimateFromTuple} from '../../../src/runtypes/entryTuple.ts';
import {withSeededRandom} from '../core/seededRng.ts';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const BRAND = `type TypeFormat<Base, Name extends string, Params> = Base & { readonly __rtFormatName?: Name; readonly __rtFormatParams?: Params; };`;

interface Compiled {
  tb: readonly unknown[];
  fb: readonly unknown[] | undefined;
  refl: readonly unknown[] | undefined;
  seed: number;
}

/** Compile `decls` + `type T = rootExpr`, returning the binary + reflection tuples
 *  and the baked cold-start seed. Asserts the type produced no Error diagnostics. **/
async function compile(client: ResolverClient, title: string, decls: string, rootExpr: string): Promise<Compiled> {
  const source = `import {createBinaryEncoderFn, createBinaryDecoderFn, getRunTypeId} from '@ts-runtypes/core';
${BRAND}
${decls}
type T = ${rootExpr};
createBinaryEncoderFn<T>();
createBinaryDecoderFn<T>();
getRunTypeId<T>();
`;
  await client.setSources({'runtypes.d.ts': RUNTYPES_DTS, 'g.ts': source});
  const resp = await client.scanFiles(['g.ts'], {includeEntryModules: true});
  const errors = (resp.diagnostics ?? []).filter((d) => d.severity === Severity.Error);
  expect(errors, `errors for ${title}: ${JSON.stringify(errors)}`).toEqual([]);
  const tuples = evalEntryModules(resp.entryModules ?? {});
  instantiateRunTypes(tuples);
  let tb: readonly unknown[] | undefined;
  let fb: readonly unknown[] | undefined;
  let refl: readonly unknown[] | undefined;
  for (const site of resp.sites ?? []) {
    if (site.fnId) {
      const tuple = tuples[`${site.fnId}_${site.id}`];
      if (tuple?.[0] === 'tb') tb = tuple;
      else if (tuple?.[0] === 'fb') fb = tuple;
    } else {
      refl = tuples[String(site.id)];
    }
  }
  expect(tb, `no tb entry for ${title}`).toBeTruthy();
  const seed = binarySizeEstimateFromTuple(tb!);
  expect(seed, `no estimate for ${title}`).toBeDefined();
  return {tb: tb!, fb, refl, seed: seed as number};
}

/** Encode `value` into a COLD buffer and assert it never grew (capacity === seed)
 *  and round-trips. **/
function assertNoGrow(compiled: Compiled, value: unknown, title: string): void {
  const encode = createBinaryEncoderFn(undefined, undefined, compiled.tb as never) as (v: unknown) => Uint8Array;
  const decode = createBinaryDecoderFn(undefined, undefined, compiled.fb as never) as (b: Uint8Array) => unknown;
  setSerializationOptions({sizeHistory: new Map()}); // cold cache
  const view = encode(value);
  const shown = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
  expect(
    view.buffer.byteLength,
    `${title}: cold buffer grew (cap ${view.buffer.byteLength} != seed ${compiled.seed}) for ${shown}`
  ).toBe(compiled.seed);
  expect(decode(view), `round-trip ${title}`).toBeDefined();
}

// =============================================================================
// 1. Packed formats (Part A)
// =============================================================================

const INT8 = `TypeFormat<number, 'numberFormat', {integer: true; min: -128; max: 127}>`;
const UINT16 = `TypeFormat<number, 'numberFormat', {integer: true; min: 0; max: 65535}>`;
const INT32 = `TypeFormat<number, 'numberFormat', {integer: true; min: -2147483648; max: 2147483647}>`;
const BIGINT64 = `TypeFormat<bigint, 'bigintFormat', {min: -9223372036854775808n; max: 9223372036854775807n}>`;

const PACKED: {title: string; rootExpr: string; value: unknown}[] = [
  {title: 'int8 scalar', rootExpr: INT8, value: 100},
  {title: 'int8 edge (min)', rootExpr: INT8, value: -128},
  {title: 'uint16 scalar', rootExpr: UINT16, value: 65535},
  {title: 'int32 scalar', rootExpr: INT32, value: -2147483648},
  {title: 'bigint64 scalar', rootExpr: BIGINT64, value: 9223372036854775807n},
  {title: 'packed-int array', rootExpr: `Array<${INT8}>`, value: [1, 2, 3, -4, 127, -128]},
  {title: 'mixed packed object', rootExpr: `{a: ${INT8}; b: ${UINT16}; c: ${INT32}}`, value: {a: 7, b: 1000, c: 70000}},
];

describe('binary size — packed formats never grow the cold buffer (Part A)', () => {
  const register = hasBinary() ? it : it.skip;

  register('in-bounds packed values encode at the seed with no resize', async () => {
    const client = new ResolverClient(BIN, REPO_ROOT, '', {serverMode: true, emitMode: 'both'});
    try {
      for (const c of PACKED) {
        const compiled = await compile(client, c.title, '', c.rootExpr);
        const sizer = createBinarySizerFn(undefined, compiled.tb as never) as (v: unknown) => number;
        setSerializationOptions({sizeHistory: new Map()});
        const view = (createBinaryEncoderFn(undefined, undefined, compiled.tb as never) as (v: unknown) => Uint8Array)(c.value);
        expect(sizer(c.value), `sizer != encoder for ${c.title}`).toBe(view.byteLength);
        expect(view.buffer.byteLength, `${c.title}: cold buffer grew`).toBe(compiled.seed);
        const decode = createBinaryDecoderFn(undefined, undefined, compiled.fb as never) as (b: Uint8Array) => unknown;
        expect(decode(view), `round-trip ${c.title}`).toEqual(c.value);
      }
    } finally {
      client.close();
    }
  });
});

// =============================================================================
// 2. Reserve floors — the audit's refuted worst-cases at a tiny adversarial config
// =============================================================================

// items=2, stringBytes=1: the smallest budgets, where the string / index-sig-key /
// regexp / enum reserve floors (binary_size_estimate.go) and the reserve-aware mock
// bounds (binarySize.ts) are load-bearing. A naive wire-size estimate resizes here.
const TINY: Required<BinarySizingOptions> = {
  sizeBias: 1,
  sizeItems: 2,
  sizeStringBytes: 1,
  sizeMaxBytes: 65536,
};

const FLOORS: {title: string; decls?: string; rootExpr: string}[] = [
  {title: 'bare string', rootExpr: 'string'},
  {title: 'string[]', rootExpr: 'string[]'},
  {title: '[string, string]', rootExpr: '[string, string]'},
  {title: 'Set<string>', rootExpr: 'Set<string>'},
  {title: 'Set<Set<string>>', rootExpr: 'Set<Set<string>>'},
  {title: 'Map<string, number>', rootExpr: 'Map<string, number>'},
  {title: 'Map<string, string>', rootExpr: 'Map<string, string>'},
  {title: 'Record<string, string>', rootExpr: 'Record<string, string>'},
  {title: 'Record<string, bigint>', rootExpr: 'Record<string, bigint>'},
  {title: 'Record<string, string[]>', rootExpr: 'Record<string, string[]>'},
  {title: 'index sig {[k:string]: string}', rootExpr: '{[k: string]: string}'},
  {title: 'bigint', rootExpr: 'bigint'},
  {title: 'regexp', rootExpr: 'RegExp'},
  {title: 'string | number union', rootExpr: 'string | number'},
  {title: 'union with object member', rootExpr: 'string | {a: string; b: string}'},
  {title: 'string enum', decls: `enum E { A = 'alpha', B = 'be', C = 'c' }`, rootExpr: 'E'},
  {title: 'object of strings', rootExpr: '{a: string; b: string; c?: string}'},
  // Template literals: the whole rendered string is one serString — static texts +
  // per-placeholder fragments — which the estimate must budget (typeGen emits none).
  {title: 'template `user-${string}`', rootExpr: '`user-${string}`'},
  {title: 'template `${string}-${string}`', rootExpr: '`${string}-${string}`'},
  {title: 'template `id-${number}`', rootExpr: '`id-${number}`'},
  {title: 'template `${string}/${number}/${string}`', rootExpr: '`${string}/${number}/${string}`'},
  {title: 'template `v${number}.${bigint}`', rootExpr: '`v${number}.${bigint}`'},
  // Non-packing format-branded bigints: the decimal serString arm, mocked within the
  // brand's own bounds (not the ±9999 mock bound), so the estimate budgets the brand.
  {title: 'branded bigint {multipleOf}', rootExpr: `TypeFormat<bigint, 'bigintFormat', {multipleOf: 7n}>`},
  {title: 'branded bigint {gt}', rootExpr: `TypeFormat<bigint, 'bigintFormat', {gt: 1000n}>`},
  {
    title: 'branded bigint 128-bit range',
    rootExpr: `TypeFormat<bigint, 'bigintFormat', {min: -1000000000000000000000n; max: 1000000000000000000000n}>`,
  },
];

describe('binary size — reserve floors hold at a tiny adversarial config', () => {
  const register = hasBinary() ? it : it.skip;

  register('an in-bounds value for each worst-case type never grows the cold buffer', async () => {
    const client = new ResolverClient(BIN, REPO_ROOT, '', {serverMode: true, emitMode: 'both', ...TINY});
    try {
      for (const c of FLOORS) {
        const compiled = await compile(client, c.title, c.decls ?? '', c.rootExpr);
        expect(compiled.refl, `no reflection tuple for ${c.title}`).toBeTruthy();
        const mock = createMockDataFn(
          undefined,
          {mock: {respectBinarySize: true, binarySizingOptions: TINY}},
          compiled.refl as never
        ) as () => unknown;
        // 30 random in-bounds values per type — exercise the bound across lengths.
        for (let i = 0; i < 30; i++) {
          const value = withSeededRandom(0x5120 + i, () => mock());
          assertNoGrow(compiled, value, c.title);
        }
      }
    } finally {
      client.close();
    }
  });
});
