// Runtime half of the JSONShape<T> agreement (the type half lives in
// test/types/jsonShape.test.ts): encode REAL values through the full
// vite-plugin pipeline, JSON.parse the wire, and compare against expected
// literals TYPED as JSONShape<T>. The typed literal is the meeting point — the
// assignment compiles only if the literal matches the declared wire type, and
// the runtime assertion passes only if the encoder actually produced it, so a
// drift on either side (the Go serializer or the mapped type) reds this file.
//
// Per the CLAUDE.md marker-coverage rule the encoder is exercised through BOTH
// call shapes — static `createJsonEncoderFn<T>()` and value-first
// `createJsonEncoderFn(value)` — with an equivalence assertion.

import {describe, test, expect} from 'vitest';
import {createJsonEncoderFn} from '@mionjs/run-types';
import type {JSONShape} from '@mionjs/run-types';

interface Order {
  id: string;
  total: bigint;
  placed: Date;
  note?: string;
}

// The encoder returns `string | undefined` (a root-level undefined has no JSON
// document form); every fixture here has a real document, so guard-and-parse.
function parseWire(wire: string | undefined): unknown {
  if (wire === undefined) throw new Error('unexpected undefined wire document');
  return JSON.parse(wire);
}

describe('JSONShape<T> — wire conformance against the real encoder', () => {
  const placed = new Date('2026-02-03T04:05:06.789Z');

  test('static form: JS-only leaves encode to their JSONShape spellings', () => {
    const encode = createJsonEncoderFn<Order>();
    const order: Order = {id: 'o1', total: 42n, placed};
    const wire = parseWire(encode(order)) as unknown;
    const expected: JSONShape<Order> = {
      id: 'o1',
      total: '42',
      placed: '2026-02-03T04:05:06.789Z',
    };
    expect(wire).toEqual(expected);
  });

  test('reflection form encodes byte-identically to the static form', () => {
    const order: Order = {id: 'o2', total: 7n, placed, note: 'hi'};
    const staticWire = createJsonEncoderFn<Order>()(order);
    const valueWire = createJsonEncoderFn(order)({...order});
    expect(valueWire).toBe(staticWire);
  });

  test('Map and Set encode as their entries / element arrays', () => {
    interface Box {
      lookup: Map<string, Date>;
      tags: Set<string>;
    }
    const encode = createJsonEncoderFn<Box>();
    const box: Box = {lookup: new Map([['a', placed]]), tags: new Set(['x', 'y'])};
    const wire = parseWire(encode(box)) as unknown;
    const expected: JSONShape<Box> = {
      lookup: [['a', '2026-02-03T04:05:06.789Z']],
      tags: ['x', 'y'],
    };
    expect(wire).toEqual(expected);
  });

  test('a JSON-natural union stays raw on the wire', () => {
    interface Toggle {
      state: 'on' | 'off';
      level: number | null;
    }
    const encode = createJsonEncoderFn<Toggle>();
    const wire = parseWire(encode({state: 'on', level: null})) as unknown;
    const expected: JSONShape<Toggle> = {state: 'on', level: null};
    expect(wire).toEqual(expected);
  });

  test('a union with a JS-only member rides the [index, value] envelope', () => {
    interface Stamp {
      at: Date | string;
    }
    const encode = createJsonEncoderFn<Stamp>();
    const parsed = parseWire(encode({at: placed})) as {at: [number, string]};
    expect(Array.isArray(parsed.at)).toBe(true);
    expect(typeof parsed.at[0]).toBe('number');
    // The typed literal pins the envelope shape; the index is read from the
    // wire (TS cannot pin the runtime member ordering).
    const expected: JSONShape<Stamp> = {at: [parsed.at[0], '2026-02-03T04:05:06.789Z']};
    expect(parsed).toEqual(expected);
  });

  test('an object-member union rides the envelope with the merged-object arm', () => {
    type ShapeUnion = {kind: 'circle'; r: Date} | {kind: 'square'; n: bigint};
    interface Holder {
      shape: ShapeUnion;
    }
    const encode = createJsonEncoderFn<Holder>();
    const parsed = parseWire(encode({shape: {kind: 'circle', r: placed}})) as {at?: unknown; shape: [number, unknown]};
    expect(Array.isArray(parsed.shape)).toBe(true);
    expect(typeof parsed.shape[0]).toBe('number');
    const expected: JSONShape<Holder> = {
      shape: [parsed.shape[0], {kind: 'circle', r: '2026-02-03T04:05:06.789Z'}],
    };
    expect(parsed).toEqual(expected);
  });

  test('tuple slots spell undefined as null; short tuples stay short', () => {
    interface Pair {
      slots: [string, string?];
    }
    const encode = createJsonEncoderFn<Pair>();
    const shortWire = parseWire(encode({slots: ['x']})) as unknown;
    const shortExpected: JSONShape<Pair> = {slots: ['x']};
    expect(shortWire).toEqual(shortExpected);
    const paddedWire = parseWire(encode({slots: ['x', undefined]})) as unknown;
    const paddedExpected: JSONShape<Pair> = {slots: ['x', null]};
    expect(paddedWire).toEqual(paddedExpected);
  });

  test('an absent optional property stays absent on the wire', () => {
    const encode = createJsonEncoderFn<Order>();
    const wire = parseWire(encode({id: 'o3', total: 1n, placed, pattern: /a/})) as Record<string, unknown>;
    expect('note' in wire).toBe(false);
  });
});
