// The `respectBinarySize` mock option — steer createMockDataFn against the binary
// cold-start size estimate. `true` keeps a value within the estimate's per-kind
// budget (so a `dynamic` buffer encodes it without growing); `false` overshoots
// one unbounded position past sizeMaxBytes (the cap every estimate stays under)
// so it must grow, for every seed. Driven value-first (the schema carries its
// own runtype, no plugin needed) so the assertions exercise the real factory.

import {describe, it, expect} from 'vitest';
import {createMockDataFn, createValidateFn} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';
import * as TF from '@mionjs/run-types/formats';

const utf8 = (s: string): number => Buffer.byteLength(s, 'utf8');
const SZ = {sizeBias: 1, sizeItems: 6, sizeStringBytes: 10, sizeMaxBytes: 65536};

describe('respectBinarySize: true — values fit the estimate', () => {
  it('caps collections at sizeItems, strings at stringBytes, bigints at the decimal budget', () => {
    const schema = RT.object({s: TF.string(), arr: RT.array(TF.number()), big: TF.bigInt(), n: TF.number()});
    const validate = createValidateFn(schema);
    const mock = createMockDataFn(schema, {mock: {respectBinarySize: true, binarySizingOptions: SZ}});
    for (let i = 0; i < 200; i++) {
      const v = mock() as {s: string; arr: number[]; big: bigint};
      expect(validate(v)).toBe(true);
      expect(utf8(v.s)).toBeLessThanOrEqual(SZ.sizeStringBytes);
      expect(v.arr.length).toBeLessThanOrEqual(SZ.sizeItems);
      expect(v.big.toString().replace('-', '').length).toBeLessThanOrEqual(20);
    }
  });

  it('honors sizeBias for strings (content ≤ round(bias·stringBytes))', () => {
    const schema = RT.array(TF.string());
    const cfg = {...SZ, sizeBias: 0.5};
    const mock = createMockDataFn(schema, {mock: {respectBinarySize: true, binarySizingOptions: cfg}});
    for (let i = 0; i < 200; i++) {
      for (const s of mock() as string[]) expect(utf8(s)).toBeLessThanOrEqual(Math.round(cfg.sizeBias * cfg.sizeStringBytes));
    }
  });

  it('omits optionals below bias 1 (an undefined optional writes 0 wire bytes, so it fits)', () => {
    const schema = RT.object({a: TF.number(), b: RT.optional(TF.string()), c: RT.optional(TF.number())});
    const mock = createMockDataFn(schema, {mock: {respectBinarySize: true, binarySizingOptions: {...SZ, sizeBias: 0.5}}});
    for (let i = 0; i < 100; i++) {
      const v = mock() as Record<string, unknown>;
      expect(v.b).toBeUndefined();
      expect(v.c).toBeUndefined();
    }
  });

  it('respects a maxLength format bound (tighter than sizeStringBytes)', () => {
    const schema = TF.string({maxLength: 3});
    const validate = createValidateFn(schema);
    const mock = createMockDataFn(schema, {mock: {respectBinarySize: true, binarySizingOptions: SZ}});
    for (let i = 0; i < 200; i++) {
      const v = mock() as string;
      expect(validate(v)).toBe(true);
      expect(v.length).toBeLessThanOrEqual(3);
    }
  });

  it('works for nested collections / tuples / records', () => {
    const schema = RT.object({
      grid: RT.array(RT.array(TF.number())),
      tup: RT.tuple({required: [TF.string(), TF.number()]}),
      rec: RT.record(TF.string(), TF.number()),
    });
    const validate = createValidateFn(schema);
    const mock = createMockDataFn(schema, {mock: {respectBinarySize: true, binarySizingOptions: SZ}});
    for (let i = 0; i < 100; i++) {
      const v = mock() as {grid: number[][]; rec: Record<string, number>};
      expect(validate(v)).toBe(true);
      expect(v.grid.length).toBeLessThanOrEqual(SZ.sizeItems);
      for (const row of v.grid) expect(row.length).toBeLessThanOrEqual(SZ.sizeItems);
      expect(Object.keys(v.rec).length).toBeLessThanOrEqual(SZ.sizeItems);
    }
  });
});

describe('respectBinarySize: false — values exceed the estimate', () => {
  // dataView.ts MAX_VARINT — a serString write reserves MAX_VARINT + 3*length.
  const MAX_VARINT = 5;
  const reserve = (text: string): number => MAX_VARINT + 3 * text.length;
  // A tiny cap keeps the inflated values small; the estimator clamps every
  // estimate to sizeMaxBytes, so a reserve past it grows any cold buffer.
  const TINY = {...SZ, sizeMaxBytes: 64};
  const SEEDS = Array.from({length: 64}, (_, i) => i + 1);

  it('inflates the one unbounded string past sizeMaxBytes for EVERY seed, the rest in-bounds', () => {
    const schema = RT.object({s: TF.string(), arr: RT.array(TF.number())});
    const validate = createValidateFn(schema);
    const mock = createMockDataFn(schema, {mock: {respectBinarySize: false, binarySizingOptions: TINY}});
    for (const seed of SEEDS) {
      const v = mock({mock: {seed}}) as {s: string; arr: number[]};
      expect(validate(v)).toBe(true);
      expect(reserve(v.s), `seed ${seed}: string reserve`).toBeGreaterThan(TINY.sizeMaxBytes);
      expect(v.arr.length, `seed ${seed}: array stays in-bounds`).toBeLessThanOrEqual(TINY.sizeItems);
    }
  });

  it('inflates an unbounded bigint past sizeMaxBytes for EVERY seed', () => {
    const schema = RT.object({big: TF.bigInt()});
    const validate = createValidateFn(schema);
    const mock = createMockDataFn(schema, {mock: {respectBinarySize: false, binarySizingOptions: TINY}});
    for (const seed of SEEDS) {
      const v = mock({mock: {seed}}) as {big: bigint};
      expect(validate(v)).toBe(true);
      expect(reserve(v.big.toString()), `seed ${seed}: bigint reserve`).toBeGreaterThan(TINY.sizeMaxBytes);
    }
  });

  it('overshoots the default 64 KiB cap when sizeMaxBytes is omitted', () => {
    const schema = TF.string();
    const mock = createMockDataFn(schema, {mock: {respectBinarySize: false, binarySizingOptions: {sizeBias: 1}}});
    expect(reserve(mock() as string)).toBeGreaterThan(64 * 1024);
  });

  it('falls back to an array-count overshoot when no string / bigint is unbounded', () => {
    const schema = RT.object({arr: RT.array(TF.number())});
    const validate = createValidateFn(schema);
    const mock = createMockDataFn(schema, {mock: {respectBinarySize: false, binarySizingOptions: TINY}});
    for (const seed of SEEDS) {
      const v = mock({mock: {seed}}) as {arr: number[]};
      expect(validate(v)).toBe(true);
      expect(v.arr.length, `seed ${seed}`).toBeGreaterThan(TINY.sizeItems);
    }
  });

  it('does not inflate a template literal (a pattern, so a longer string would be invalid)', () => {
    const schema = RT.object({id: RT.templateLiteral(['user-', TF.number()]), free: TF.string()});
    const validate = createValidateFn(schema);
    const mock = createMockDataFn(schema, {mock: {respectBinarySize: false, binarySizingOptions: TINY}});
    for (const seed of SEEDS) {
      const v = mock({mock: {seed}}) as {id: string; free: string};
      expect(validate(v)).toBe(true);
      expect(v.id).toMatch(/^user-/);
      expect(reserve(v.free)).toBeGreaterThan(TINY.sizeMaxBytes);
    }
  });

  it('does not inflate a maxLength-bounded string (stays valid)', () => {
    const schema = RT.object({fixed: TF.string({maxLength: 4}), free: TF.string()});
    const validate = createValidateFn(schema);
    const mock = createMockDataFn(schema, {mock: {respectBinarySize: false, binarySizingOptions: TINY}});
    for (const seed of SEEDS) {
      const v = mock({mock: {seed}}) as {fixed: string; free: string};
      expect(validate(v)).toBe(true);
      expect(v.fixed.length).toBeLessThanOrEqual(4); // the bounded field is never the inflated one
      expect(reserve(v.free)).toBeGreaterThan(TINY.sizeMaxBytes);
    }
  });
});

describe('respectBinarySize: undefined — unchanged', () => {
  it('still generates valid values with no size bounding', () => {
    const schema = RT.object({s: TF.string(), arr: RT.array(TF.number())});
    const validate = createValidateFn(schema);
    const mock = createMockDataFn(schema);
    for (let i = 0; i < 50; i++) expect(validate(mock())).toBe(true);
  });
});
