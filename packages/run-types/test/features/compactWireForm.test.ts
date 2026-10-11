// Pins the compact wire text a round-trip cannot see; round-trips of these shapes live in suites/serialization.
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
type ObjectOrUndefined = {a: string} | undefined;
type SharedSlot = {k: 'a'; f?: Date} | {k: 'b'; f?: number} | {k: 'c'};
type NestedDoc =
  | {
      kind: 'text';
      body: string;
      style?: {type: 'plain'} | {type: 'rich'; marks: ({mark: 'bold'} | {mark: 'link'; href: string; at?: Date})[]};
    }
  | {kind: 'image'; src: string; caption?: {lang: string; text: string} | null}
  | {kind: 'group'; items: ({kind: 'ref'; id: number} | {kind: 'inline'; note: string | null})[]};

describe('compact wire / unions', () => {
  it('the soak shape writes one positional array per member', () => {
    const enc = createJsonEncoderFn<Tagged>(undefined, compact);
    const dec = createJsonDecoderFn<Tagged>(undefined, compact);
    expect(enc({kind: 't1', f0: [{'with"quote': true}]})).toBe('["t1",[[true]]]');
    expect(enc({kind: 't0'})).toBe('["t0",0]');
    expect(dec('["t1",[[true]]]')).toEqual({kind: 't1', f0: [{'with"quote': true}]});
  });

  it('a missing nested object holds `0`', () => {
    const enc = createJsonEncoderFn<NestedObject>(undefined, compact);
    expect(enc({kind: 'b', f: {x: 1}})).toBe('["b",[1]]');
    expect(enc({kind: 'a'})).toBe('["a",0]');
  });

  it('PaymentMethod[] is the 164-byte positional wire', () => {
    const enc = createJsonEncoderFn<PaymentMethod[]>(undefined, compact);
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
  });

  it('no member is picked on encode: one slot per prop across members', () => {
    expect(createJsonEncoderFn<Contact>(undefined, compact)({email: 'a@b.c', phone: '123'})).toBe('["a@b.c","123"]');
  });

  it('a member that can be an array keeps the wrapper', () => {
    const enc = createJsonEncoderFn<ObjectOrStrings>(undefined, compact);
    expect(enc({a: 'x'})).toBe('[-1,["x"]]');
    expect(enc(['x'])).toBe('[0,["x"]]');
  });

  it('a member that is always a plain scalar needs no wrapper', () => {
    const enc = createJsonEncoderFn<TagOrNull>(undefined, compact);
    expect(enc({tag: 'x'})).toBe('["x"]');
    expect(enc(null)).toBe('null');
  });

  it('`undefined` is not a plain scalar on the wire, so it keeps the wrapper', () => {
    const enc = createJsonEncoderFn<ObjectOrUndefined>(undefined, compact);
    const dec = createJsonDecoderFn<ObjectOrUndefined>(undefined, compact);
    expect(enc({a: 'x'})).toBe('[-1,["x"]]');
    expect(dec(enc({a: 'x'})!)).toEqual({a: 'x'});
    expect(dec(enc(undefined)!)).toBe(undefined);
  });

  it('a value matching no candidate of a shared slot writes the placeholder', () => {
    const enc = createJsonEncoderFn<SharedSlot>(undefined, compact);
    const dec = createJsonDecoderFn<SharedSlot>(undefined, compact);
    // `f` is undeclared on `c`: the slot holds `0` and decodes absent.
    const stray = {k: 'c', f: 1} as SharedSlot;
    expect(enc(stray)).toBe('["c",0]');
    expect(dec(enc(stray)!)).toEqual({k: 'c'});
  });

  it('nested object unions go positional at every level', () => {
    const enc = createJsonEncoderFn<NestedDoc>(undefined, compact);
    const dec = createJsonDecoderFn<NestedDoc>(undefined, compact);
    const rich: NestedDoc = {
      kind: 'text',
      body: 'hi',
      style: {type: 'rich', marks: [{mark: 'bold'}, {mark: 'link', href: '/b', at: new Date('2024-01-01T00:00:00.000Z')}]},
    };
    // Outer slots: kind, body, style, src, caption, items; each inner union has its own.
    expect(enc(rich)).toBe('["text","hi",["rich",[["bold",0,0],["link","/b","2024-01-01T00:00:00.000Z"]]],0,0,0]');
    expect(enc({kind: 'image', src: 'a.png', caption: null})).toBe('["image",0,0,"a.png",null,0]');
    expect(enc({kind: 'image', src: 'a.png'})).toBe('["image",0,0,"a.png",0,0]');
    // Absent `id` (number) is `null`, absent `note` (string | null) is `0`: `["inline",null,null]` is no id, null note.
    const group: NestedDoc = {
      kind: 'group',
      items: [
        {kind: 'ref', id: 1},
        {kind: 'inline', note: null},
      ],
    };
    expect(enc(group)).toBe('["group",0,0,0,0,[["ref",1,0],["inline",null,null]]]');
    expect(dec(enc(group)!)).toEqual(group);
    expect(dec(enc(rich)!)).toEqual(rich);
  });

  it('keyed strategies still write the same union raw, without an envelope', () => {
    expect(createJsonEncoderFn<NestedObject>()({kind: 'b', f: {x: 1}})).toBe('{"kind":"b","f":{"x":1}}');
  });

  it('atomic-only union whose array arm holds objects wraps its arms', () => {
    expect(createJsonEncoderFn<ArrayOrString>(undefined, compact)([{a: 1}])).toBe('[1,[[1]]]');
  });

  it('a record member keeps the keyed form: object values wrap, atomic values stay bare', () => {
    expect(createJsonEncoderFn<RecordOfObjects>(undefined, compact)({x: {a: 1}})).toBe('[1,{"x":[1]}]');
    expect(createJsonEncoderFn<RecordOfNumbers>(undefined, compact)({x: 1})).toBe('{"x":1}');
  });

  // Marker coverage rule: both getRunTypeId call shapes must resolve the union to ONE id and ONE compact codec.
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

describe('compact wire / placeholder per slot type', () => {
  it('`s?: string | null` marks absent with `0`', () => {
    const enc = createJsonEncoderFn<{s?: string | null}>(undefined, compact);
    const dec = createJsonDecoderFn<{s?: string | null}>(undefined, compact);
    expect(enc({})).toBe('[0]');
    expect(enc({s: null})).toBe('[null]');
    expect(dec('[0]')).toEqual({});
  });

  it('`n?: number | null` marks absent with `false`', () => {
    const enc = createJsonEncoderFn<{n?: number | null}>(undefined, compact);
    const dec = createJsonDecoderFn<{n?: number | null}>(undefined, compact);
    expect(enc({})).toBe('[false]');
    expect(dec('[false]')).toEqual({});
    expect(dec('[0]')).toEqual({n: 0});
  });

  it('`n?: number` marks absent with `null`', () => {
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
