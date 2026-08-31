// Buffer-sizing strategies: createBinaryEncoderFn({sizeStrategy}) specializes the
// returned function's signature + overflow behavior. All four produce identical
// wire bytes and return a Uint8Array view of the written bytes (`.byteLength` is
// the exact size); createBinaryDecoderFn accepts it directly, so decode(encode(v))
// round-trips:
//   - 'dynamic'      (default) (val) => Uint8Array      grow as needed
//   - 'precalculate'           (val) => Uint8Array      measure pass → exact, can't overflow
//   - 'initialSize'            (val, size) => Uint8Array caller size; throws on overflow
//   - 'intoBuffer'                   (val, into) => Uint8Array caller buffer; throws on overflow (zero-copy)

import * as TF from '@mionjs/run-types/formats';
import {describe, it, expect} from 'vitest';
import * as RT from '@mionjs/run-types/builders';
import {
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  createBinarySizerFn,
  RunTypeKind,
  type BinaryEncoderFn,
  type BinaryEncoderSizeFn,
  type BinaryEncoderIntoFn,
  type BinarySizerFn,
  type BinaryDecoderFn,
} from '@mionjs/run-types';
import {createSizingSerializer, createDataViewSerializer} from '../../src/runtypes/dataView.ts';

// Compile-time guard: the createBinaryEncoderFn overload must SPECIALISE the
// returned function to the `sizeStrategy` literal — not just structurally widen
// (BinaryEncoderFn is assignable to the 2-arg variants, so a typed bundle would
// hide a regression). Never executed; tsc checks each @ts-expect-error, and an
// unused one (or an un-expected error on a positive line) fails typecheck:test.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _encoderReturnSignatureChecks(v: {a: number}): void {
  const s = RT.object({a: TF.number()});

  // dynamic + precalculate take only the value.
  const dynamic = createBinaryEncoderFn(s);
  dynamic(v);
  // @ts-expect-error dynamic encoder takes only the value
  dynamic(v, 100);
  const precalc = createBinaryEncoderFn(s, {sizeStrategy: 'precalculate'});
  precalc(v);
  // @ts-expect-error precalculate encoder takes only the value
  precalc(v, 100);

  // value-first SCHEMA form (T inferred from the schema).
  const sizedSchema = createBinaryEncoderFn(s, {sizeStrategy: 'initialSize'});
  sizedSchema(v, 100);
  // @ts-expect-error initialSize encoder requires a numeric size argument
  sizedSchema(v);
  const intoSchema = createBinaryEncoderFn(s, {sizeStrategy: 'intoBuffer'});
  intoSchema(v, new ArrayBuffer(8));
  // @ts-expect-error into encoder requires an ArrayBuffer argument
  intoSchema(v);

  // STATIC form (explicit type param + undefined value) — the form the docs use.
  const sizedStatic = createBinaryEncoderFn<{a: number}>(undefined, {sizeStrategy: 'initialSize'});
  sizedStatic(v, 100);
  // @ts-expect-error initialSize encoder requires a numeric size argument
  sizedStatic(v);
  const intoStatic = createBinaryEncoderFn<{a: number}>(undefined, {sizeStrategy: 'intoBuffer'});
  intoStatic(v, new ArrayBuffer(8));
  // @ts-expect-error into encoder requires an ArrayBuffer argument
  intoStatic(v);
}
void _encoderReturnSignatureChecks;

describe('binary sizing — measure pass matches the encoder', () => {
  it('serString size math equals real bytes written', () => {
    const samples = ['', 'a', 'hello', 'café', '€uro', '𝔘nicode surrogate', 'x'.repeat(200), 'y'.repeat(20000)];
    for (const s of samples) {
      const sizer = createSizingSerializer('k');
      sizer.serString(s);
      const real = createDataViewSerializer('k', 1 << 20);
      real.serString(s);
      expect(sizer.getLength(), `serString(${JSON.stringify(s.slice(0, 12))}…)`).toBe(real.getLength());
    }
  });

  it('serLength size math equals real bytes written (varint boundaries)', () => {
    for (const n of [0, 1, 127, 128, 300, 16383, 16384, 2097151, 2097152, 1_000_000]) {
      const sizer = createSizingSerializer('k');
      sizer.serLength(n);
      const real = createDataViewSerializer('k', 16);
      real.serLength(n);
      expect(sizer.getLength(), `serLength(${n})`).toBe(real.getLength());
    }
  });
});

describe('binary sizing — fixed-size serializers never call ensureCapacity', () => {
  it('growing serializer has a grow fn; fixed-size, caller-buffer, and measure pass do not', () => {
    expect(createDataViewSerializer('k', {grow: true}).ensureCapacity, 'dynamic').toBeTypeOf('function');
    expect(createDataViewSerializer('k', {size: 64, grow: false}).ensureCapacity, 'fixed size').toBeUndefined();
    expect(createDataViewSerializer('k', {buffer: new ArrayBuffer(64)}).ensureCapacity, 'into buffer').toBeUndefined();
    expect(createSizingSerializer('k').ensureCapacity, 'measure pass').toBeUndefined();
  });
});

// The four encoders + sizer + decoder are created at the CALL SITE against a
// concrete schema (a generic RunType<T> helper would erase the type and inject the
// wrong entry), then handed in here. `createBinarySizerFn` gives the exact size for
// the fixed-size strategies.
interface StrategyBundle {
  dynamic: BinaryEncoderFn;
  precalculate: BinaryEncoderFn;
  initialSize: BinaryEncoderSizeFn;
  into: BinaryEncoderIntoFn;
  sizer: BinarySizerFn;
  dec: BinaryDecoderFn<unknown>;
}

function assertStrategiesAgree<T>(b: StrategyBundle, value: T): void {
  const size = b.sizer(value);
  const ref = Array.from(b.dynamic(value));
  expect(Array.from(b.precalculate(value)), 'precalculate == dynamic').toEqual(ref);
  expect(Array.from(b.initialSize(value, size)), 'initialSize == dynamic').toEqual(ref);
  expect(Array.from(b.into(value, new ArrayBuffer(size))), 'into == dynamic').toEqual(ref);

  expect(b.dec(b.dynamic(value)), 'dynamic round-trips').toEqual(value);
  expect(b.dec(b.precalculate(value)), 'precalculate round-trips').toEqual(value);
  expect(b.dec(b.initialSize(value, size)), 'initialSize round-trips').toEqual(value);
  expect(b.dec(b.into(value, new ArrayBuffer(size))), 'into round-trips').toEqual(value);
}

describe('binary sizing — all four strategies are byte-identical + round-trip', () => {
  it('bare string', () => {
    const s = TF.string();
    assertStrategiesAgree(
      {
        dynamic: createBinaryEncoderFn(s),
        precalculate: createBinaryEncoderFn(s, {sizeStrategy: 'precalculate'}),
        initialSize: createBinaryEncoderFn(s, {sizeStrategy: 'initialSize'}),
        into: createBinaryEncoderFn(s, {sizeStrategy: 'intoBuffer'}),
        sizer: createBinarySizerFn(s),
        dec: createBinaryDecoderFn(s),
      },
      'hello world'
    );
  });

  it('object with mixed scalars + array + optional', () => {
    const s = RT.object({
      id: TF.number(),
      name: TF.string(),
      active: RT.boolean(),
      tags: RT.array(TF.string()),
      note: RT.optional(TF.string()),
    });
    const b: StrategyBundle = {
      dynamic: createBinaryEncoderFn(s),
      precalculate: createBinaryEncoderFn(s, {sizeStrategy: 'precalculate'}),
      initialSize: createBinaryEncoderFn(s, {sizeStrategy: 'initialSize'}),
      into: createBinaryEncoderFn(s, {sizeStrategy: 'intoBuffer'}),
      sizer: createBinarySizerFn(s),
      dec: createBinaryDecoderFn(s),
    };
    assertStrategiesAgree(b, {id: 7, name: 'Ada', active: true, tags: ['a', 'bb', 'ccc'], note: 'x'});
    assertStrategiesAgree(b, {id: 0, name: '', active: false, tags: []}); // note absent
  });

  it('array of numbers (inline fixed-width loop)', () => {
    const s = RT.array(TF.number());
    assertStrategiesAgree(
      {
        dynamic: createBinaryEncoderFn(s),
        precalculate: createBinaryEncoderFn(s, {sizeStrategy: 'precalculate'}),
        initialSize: createBinaryEncoderFn(s, {sizeStrategy: 'initialSize'}),
        into: createBinaryEncoderFn(s, {sizeStrategy: 'intoBuffer'}),
        sizer: createBinarySizerFn(s),
        dec: createBinaryDecoderFn(s),
      },
      [1, 2.5, -3, 1e9, 0]
    );
  });

  it('union of object members', () => {
    const s = RT.union([RT.object({kind: RT.literal('a'), x: TF.number()}), RT.object({kind: RT.literal('b'), y: TF.string()})]);
    expect(s.kind).toBe(RunTypeKind.union);
    const b: StrategyBundle = {
      dynamic: createBinaryEncoderFn(s),
      precalculate: createBinaryEncoderFn(s, {sizeStrategy: 'precalculate'}),
      initialSize: createBinaryEncoderFn(s, {sizeStrategy: 'initialSize'}),
      into: createBinaryEncoderFn(s, {sizeStrategy: 'intoBuffer'}),
      sizer: createBinarySizerFn(s),
      dec: createBinaryDecoderFn(s),
    };
    assertStrategiesAgree(b, {kind: 'a', x: 42});
    assertStrategiesAgree(b, {kind: 'b', y: 'hello'});
  });
});

describe("binary sizing — 'initialSize' enforces its fixed buffer", () => {
  it('throws RangeError when size is too small, succeeds at the exact size', () => {
    const s = RT.object({name: TF.string(), tags: RT.array(TF.string())});
    const value = {name: 'Ada Lovelace', tags: ['mathematician', 'programmer']};
    const exact = createBinarySizerFn(s)(value);
    const enc = createBinaryEncoderFn(s, {sizeStrategy: 'initialSize'});

    expect(() => enc(value, exact - 1)).toThrow(RangeError);
    expect(createBinaryDecoderFn(s)(enc(value, exact))).toEqual(value);
    expect(enc(value, exact).byteLength).toBe(exact);
  });
});

describe("binary sizing — 'intoBuffer' writes into the caller's buffer", () => {
  it('zero-copy view into the supplied buffer; throws when it does not fit', () => {
    const s = RT.array(TF.string());
    const value = ['alpha', 'beta', 'gamma'];
    const exact = createBinarySizerFn(s)(value);
    const enc = createBinaryEncoderFn(s, {sizeStrategy: 'intoBuffer'});

    const buf = new ArrayBuffer(exact);
    const view = enc(value, buf);
    expect(view.buffer, 'view aliases the caller buffer (zero-copy)').toBe(buf);
    expect(view.byteLength).toBe(exact);
    expect(createBinaryDecoderFn(s)(enc(value, new ArrayBuffer(exact)))).toEqual(value);

    expect(() => enc(value, new ArrayBuffer(exact - 1))).toThrow(RangeError);
  });
});

describe('binary sizing — dynamic seeds the cold start from the compile-time estimate', () => {
  it('a cold dynamic buffer uses the per-type estimate, not the flat default', () => {
    const s = RT.object({id: TF.number(), name: TF.string(), active: RT.boolean()});
    // A fresh cacheKey ⇒ no per-key history ⇒ the cold-start size is the
    // estimate the plugin baked into the `tb` tuple (read off `id`). If the
    // estimate were missing it would fall back to defaultBufferSize (2**14).
    const enc = createBinaryEncoderFn(s, {cacheKey: 'cold-start-estimate-probe'});
    // The returned Uint8Array views the encoder's buffer; `.buffer.byteLength` is
    // the allocated cold-start size (the estimate), `.byteLength` the written bytes.
    const out = enc({id: 1, name: 'Ada', active: true});
    expect(out.buffer.byteLength, 'cold buffer is the tight per-type estimate').toBeLessThan(2 ** 14);
    expect(out.buffer.byteLength, 'not the flat defaultBufferSize fallback').not.toBe(2 ** 14);
    expect(out.buffer.byteLength, 'estimate covers the payload (no grow needed)').toBeGreaterThanOrEqual(out.byteLength);
  });

  it('a larger declared type seeds a larger cold buffer than a tiny one', () => {
    const tiny = RT.object({flag: RT.boolean()});
    const big = RT.object({a: TF.string(), b: TF.string(), c: TF.string(), items: RT.array(TF.string())});
    const tinyBuf = createBinaryEncoderFn(tiny, {cacheKey: 'cold-tiny-probe'})({flag: true}).buffer.byteLength;
    const bigBuf = createBinaryEncoderFn(big, {cacheKey: 'cold-big-probe'})({a: '', b: '', c: '', items: []}).buffer.byteLength;
    expect(bigBuf, 'the array-bearing type estimates a bigger cold buffer').toBeGreaterThan(tinyBuf);
  });
});

describe('createBinarySizerFn — exact byte count without allocating', () => {
  it('value-first form: sizer === encoder byteLength', () => {
    const s = RT.object({id: TF.number(), name: TF.string(), tags: RT.array(TF.string())});
    const size = createBinarySizerFn(s);
    const enc = createBinaryEncoderFn(s);
    for (const v of [
      {id: 1, name: 'a', tags: []},
      {id: 2, name: 'hello', tags: ['x', 'yy', 'zzz']},
    ]) {
      expect(size(v)).toBe(enc(v).byteLength);
    }
  });

  it('static form: sizer === encoder byteLength', () => {
    const size = createBinarySizerFn<{a: number; b: string}>();
    const enc = createBinaryEncoderFn<{a: number; b: string}>();
    const v = {a: 42, b: 'hello world'};
    expect(size(v)).toBe(enc(v).byteLength);
  });
});
