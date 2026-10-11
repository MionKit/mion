// The compact strategy writes a union's object members as ONE positional array over every member's props, a
// missing prop holding the first of `0` / `null` / `false` its slot can never be. A wrapper (`[-1, …]` /
// `[idx, value]`) is added only when a non-object member can be an array on the wire.
// Regression (roundtrip fuzz soak, seed 0xd179ff0b): `{kind: 't1', f0: [{"with\"quote": true}]}` once came back as
// `{kind: 't1', f0: [[true]]}`, a nested positional array the identity decoder handed back.
import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createJsonEncoderFn, getRunTypeId} from '@mionjs/run-types';

const compact = {strategy: 'compact'} as const;

type Tagged = {kind: 't0'} | {kind: 't1'; f0: [{'with"quote': boolean}]} | {kind: 't2'} | {kind: 't3'};
type NestedObject = {kind: 'a'} | {kind: 'b'; f: {x: number}};
type ArrayOrString = {a: number}[] | string;
type RecordOfObjects = Record<string, {a: number}> | {kind: 'x'};
type RecordOfNumbers = Record<string, number> | {kind: 'x'};
type PaymentMethod =
  | {type: 'credit_card'; lastFourDigits: string; expiryMonth: number; expiryYear: number; brand: string}
  | {type: 'bank_account'; bankName: string; accountLastFour: string; routingNumber: string}
  | {type: 'paypal'; email: string};
type Contact = {email: string} | {email: string; phone?: string};
type ObjectOrStrings = {a: string} | string[];
type TagOrNull = {tag: string} | null;

describe('serialization / compact union encoding', () => {
  it('the soak shape: tuple of a quoted-key object inside a tagged union round-trips', () => {
    const enc = createJsonEncoderFn<Tagged>(undefined, compact);
    const dec = createJsonDecoderFn<Tagged>(undefined, compact);
    const value: Tagged = {kind: 't1', f0: [{'with"quote': true}]};
    expect(enc(value)).toBe('["t1",[[true]]]');
    expect(dec(enc(value)!)).toEqual(value);
    expect(enc({kind: 't0'})).toBe('["t0",0]');
    expect(dec(enc({kind: 't0'})!)).toEqual({kind: 't0'});
  });

  it('nested object member: one positional array, a missing nested object holding `0`', () => {
    const enc = createJsonEncoderFn<NestedObject>(undefined, compact);
    const dec = createJsonDecoderFn<NestedObject>(undefined, compact);
    expect(enc({kind: 'b', f: {x: 1}})).toBe('["b",[1]]');
    expect(enc({kind: 'a'})).toBe('["a",0]');
    expect(dec(enc({kind: 'b', f: {x: 1}})!)).toEqual({kind: 'b', f: {x: 1}});
    expect(dec(enc({kind: 'a'})!)).toEqual({kind: 'a'});
  });

  it('PaymentMethod[] is the 164-byte positional wire and round-trips', () => {
    const enc = createJsonEncoderFn<PaymentMethod[]>(undefined, compact);
    const dec = createJsonDecoderFn<PaymentMethod[]>(undefined, compact);
    const value: PaymentMethod[] = [
      {type: 'credit_card', lastFourDigits: '4242', expiryMonth: 12, expiryYear: 2025, brand: 'visa'},
      {type: 'bank_account', bankName: 'Chase', accountLastFour: '1234', routingNumber: '021000021'},
      {type: 'paypal', email: 'john.paypal@example.com'},
    ];
    const wire = enc(value)!;
    expect(wire).toBe(
      '[["credit_card","4242",12,2025,"visa",0,0,0,0],' +
        '["bank_account",0,null,null,0,"Chase","1234","021000021",0],' +
        '["paypal",0,null,null,0,0,0,0,"john.paypal@example.com"]]'
    );
    expect(wire.length).toBe(164);
    expect(JSON.stringify(value).length).toBe(246);
    expect(dec(wire)).toEqual(value);
  });

  it('no member is picked on encode, so an optional only one member declares survives', () => {
    const enc = createJsonEncoderFn<Contact>(undefined, compact);
    const dec = createJsonDecoderFn<Contact>(undefined, compact);
    expect(enc({email: 'a@b.c', phone: '123'})).toBe('["a@b.c","123"]');
    expect(dec(enc({email: 'a@b.c', phone: '123'})!)).toEqual({email: 'a@b.c', phone: '123'});
    expect(dec(enc({email: 'a@b.c'})!)).toEqual({email: 'a@b.c'});
  });

  it('a member that can be an array keeps the wrapper', () => {
    const enc = createJsonEncoderFn<ObjectOrStrings>(undefined, compact);
    const dec = createJsonDecoderFn<ObjectOrStrings>(undefined, compact);
    expect(enc({a: 'x'})).toBe('[-1,["x"]]');
    expect(enc(['x'])).toBe('[0,["x"]]');
    expect(dec(enc({a: 'x'})!)).toEqual({a: 'x'});
    expect(dec(enc(['x'])!)).toEqual(['x']);
  });

  it('a member that is always a plain scalar needs no wrapper', () => {
    const enc = createJsonEncoderFn<TagOrNull>(undefined, compact);
    const dec = createJsonDecoderFn<TagOrNull>(undefined, compact);
    expect(enc({tag: 'x'})).toBe('["x"]');
    expect(enc(null)).toBe('null');
    expect(dec('["x"]')).toEqual({tag: 'x'});
    expect(dec('null')).toBe(null);
  });

  it('keyed strategies still round-trip the same union raw, without an envelope', () => {
    const clone = createJsonEncoderFn<NestedObject>();
    const dec = createJsonDecoderFn<NestedObject>();
    expect(clone({kind: 'b', f: {x: 1}})).toBe('{"kind":"b","f":{"x":1}}');
    expect(dec(clone({kind: 'b', f: {x: 1}})!)).toEqual({kind: 'b', f: {x: 1}});
  });

  it('atomic-only union whose array arm holds objects wraps its arms', () => {
    const enc = createJsonEncoderFn<ArrayOrString>(undefined, compact);
    const dec = createJsonDecoderFn<ArrayOrString>(undefined, compact);
    expect(enc([{a: 1}])).toBe('[1,[[1]]]');
    expect(dec(enc([{a: 1}])!)).toEqual([{a: 1}]);
    expect(dec(enc('hi')!)).toBe('hi');
  });

  it('a record member keeps the keyed form: object values wrap, atomic values stay bare', () => {
    const objects = createJsonEncoderFn<RecordOfObjects>(undefined, compact);
    const objectsDec = createJsonDecoderFn<RecordOfObjects>(undefined, compact);
    expect(objects({x: {a: 1}})).toBe('[1,{"x":[1]}]');
    expect(objectsDec(objects({x: {a: 1}})!)).toEqual({x: {a: 1}});
    expect(objectsDec(objects({kind: 'x'})!)).toEqual({kind: 'x'});

    const numbers = createJsonEncoderFn<RecordOfNumbers>(undefined, compact);
    const numbersDec = createJsonDecoderFn<RecordOfNumbers>(undefined, compact);
    expect(numbers({x: 1})).toBe('{"x":1}');
    expect(numbersDec(numbers({x: 1})!)).toEqual({x: 1});
  });

  // Marker coverage rule: the value-first factory shape `createJsonEncoderFn(value, …)` infers T from the value and
  // must land on the same compact codec as the static `createJsonEncoderFn<T>(undefined, …)` shape; both
  // getRunTypeId shapes must resolve the union to ONE id.
  it('value-first and static shapes produce the same compact wire (reflect + static)', () => {
    const value: NestedObject = {kind: 'b', f: {x: 1}};
    const reflectEnc = createJsonEncoderFn(value, compact);
    const staticEnc = createJsonEncoderFn<NestedObject>(undefined, compact);
    expect(reflectEnc(value)).toBe(staticEnc(value));

    const reflectDec = createJsonDecoderFn(value, compact);
    expect(reflectDec(staticEnc(value)!)).toEqual(value);

    expect(getRunTypeId(value)).toBe(getRunTypeId<NestedObject>());
  });
});

describe('serialization / compact placeholder per slot type', () => {
  it('`s?: string | null` keeps a present null: `0` marks absent', () => {
    const enc = createJsonEncoderFn<{s?: string | null}>(undefined, compact);
    const dec = createJsonDecoderFn<{s?: string | null}>(undefined, compact);
    expect(enc({})).toBe('[0]');
    expect(enc({s: null})).toBe('[null]');
    expect(dec('[null]')).toEqual({s: null});
    expect(dec('[0]')).toEqual({});
  });

  it('`n?: number | null` uses `false`', () => {
    const enc = createJsonEncoderFn<{n?: number | null}>(undefined, compact);
    const dec = createJsonDecoderFn<{n?: number | null}>(undefined, compact);
    expect(enc({})).toBe('[false]');
    expect(dec('[false]')).toEqual({});
    expect(dec('[null]')).toEqual({n: null});
    expect(dec('[0]')).toEqual({n: 0});
  });

  it('`n?: number` uses `null`', () => {
    const enc = createJsonEncoderFn<{n?: number}>(undefined, compact);
    expect(enc({})).toBe('[null]');
    expect(enc({n: 0})).toBe('[0]');
  });

  it('`u?: unknown` has no free value and keeps the null collapse', () => {
    const enc = createJsonEncoderFn<{u?: unknown}>(undefined, compact);
    const dec = createJsonDecoderFn<{u?: unknown}>(undefined, compact);
    expect(enc({})).toBe('[null]');
    expect(dec(enc({u: null})!)).toEqual({});
    expect(dec('[0]')).toEqual({u: 0});
  });
});
