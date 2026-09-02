// Regression (roundtrip fuzz soak, seed 0xd179ff0b): a union of JSON-compatible
// object members round-trips raw on the keyed strategies (no `[-1, …]` envelope,
// identity decode). The compact strategy reused that rule, but it turns every
// NESTED object into a positional array, so `{kind: 't1', f0: [{"with\"quote":
// true}]}` came back as `{kind: 't1', f0: [[true]]}`. Compact now keeps the
// envelope whenever a member positionalizes something, and drops it only when
// nothing inside the union changes shape (the record-union optimisation).
import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createJsonEncoderFn, getRunTypeId} from '@mionjs/run-types';

// A top-level union enveloped on the wire starts with `[-1,` / `[<digit>,`.
const TOP_ENVELOPE = /^\[-?\d/;

type Tagged = {kind: 't0'} | {kind: 't1'; f0: [{'with"quote': boolean}]} | {kind: 't2'} | {kind: 't3'};
type NestedObject = {kind: 'a'} | {kind: 'b'; f: {x: number}};
type ArrayOrString = {a: number}[] | string;
type RecordOfObjects = Record<string, {a: number}> | {kind: 'x'};
type RecordOfNumbers = Record<string, number> | {kind: 'x'};

describe('serialization / compact union with nested objects (regression)', () => {
  it('the soak shape: tuple of a quoted-key object inside a tagged union round-trips', () => {
    const enc = createJsonEncoderFn<Tagged>(undefined, {strategy: 'compact'});
    const dec = createJsonDecoderFn<Tagged>(undefined, {strategy: 'compact'});
    const value: Tagged = {kind: 't1', f0: [{'with"quote': true}]};
    const wire = enc(value)!;
    expect(wire).toMatch(TOP_ENVELOPE);
    expect(dec(wire)).toEqual(value);
    expect(dec(enc({kind: 't0'})!)).toEqual({kind: 't0'});
  });

  it('nested object member keeps the envelope and rebuilds the keyed object', () => {
    const enc = createJsonEncoderFn<NestedObject>(undefined, {strategy: 'compact'});
    const dec = createJsonDecoderFn<NestedObject>(undefined, {strategy: 'compact'});
    expect(enc({kind: 'b', f: {x: 1}})).toBe('[-1,{"kind":"b","f":[1]}]');
    expect(dec(enc({kind: 'b', f: {x: 1}})!)).toEqual({kind: 'b', f: {x: 1}});
    expect(dec(enc({kind: 'a'})!)).toEqual({kind: 'a'});
  });

  it('keyed strategies still round-trip the same union raw, without an envelope', () => {
    const clone = createJsonEncoderFn<NestedObject>();
    const dec = createJsonDecoderFn<NestedObject>();
    expect(clone({kind: 'b', f: {x: 1}})).toBe('{"kind":"b","f":{"x":1}}');
    expect(dec(clone({kind: 'b', f: {x: 1}})!)).toEqual({kind: 'b', f: {x: 1}});
  });

  it('atomic-only union whose array arm holds objects wraps its arms', () => {
    const enc = createJsonEncoderFn<ArrayOrString>(undefined, {strategy: 'compact'});
    const dec = createJsonDecoderFn<ArrayOrString>(undefined, {strategy: 'compact'});
    expect(enc([{a: 1}])).toMatch(TOP_ENVELOPE);
    expect(dec(enc([{a: 1}])!)).toEqual([{a: 1}]);
    expect(dec(enc('hi')!)).toBe('hi');
  });

  it('record member with object values wraps, record member with atomic values stays bare', () => {
    const objects = createJsonEncoderFn<RecordOfObjects>(undefined, {strategy: 'compact'});
    const objectsDec = createJsonDecoderFn<RecordOfObjects>(undefined, {strategy: 'compact'});
    expect(objects({x: {a: 1}})).toMatch(TOP_ENVELOPE);
    expect(objectsDec(objects({x: {a: 1}})!)).toEqual({x: {a: 1}});
    expect(objectsDec(objects({kind: 'x'})!)).toEqual({kind: 'x'});

    const numbers = createJsonEncoderFn<RecordOfNumbers>(undefined, {strategy: 'compact'});
    const numbersDec = createJsonDecoderFn<RecordOfNumbers>(undefined, {strategy: 'compact'});
    expect(numbers({x: 1})).toBe('{"x":1}');
    expect(numbersDec(numbers({x: 1})!)).toEqual({x: 1});
  });

  // Marker coverage rule: the value-first factory shape `createJsonEncoderFn(value,
  // …)` infers T from the value and must land on the same compact codec as the
  // static `createJsonEncoderFn<T>(undefined, …)` shape; both getRunTypeId shapes
  // must resolve the union to ONE id.
  it('value-first and static shapes produce the same compact wire (reflect + static)', () => {
    const value: NestedObject = {kind: 'b', f: {x: 1}};
    const reflectEnc = createJsonEncoderFn(value, {strategy: 'compact'});
    const staticEnc = createJsonEncoderFn<NestedObject>(undefined, {strategy: 'compact'});
    expect(reflectEnc(value)).toBe(staticEnc(value));

    const reflectDec = createJsonDecoderFn(value, {strategy: 'compact'});
    expect(reflectDec(staticEnc(value)!)).toEqual(value);

    expect(getRunTypeId(value)).toBe(getRunTypeId<NestedObject>());
  });
});
