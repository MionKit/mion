// Regression: optional / literal-union members must NOT serialize through the
// `[index, value]` discriminated-union envelope. Asserts the actual JSON string
// the encoder produces (not just a round-trip), so a re-introduced envelope
// (`{"active":[1,false]}`) fails loudly.
import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createJsonEncoderFn, getRunTypeId} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';
import * as TF from '@ts-runtypes/core/formats';

// A property value encoded as `:[<digit>…` is the union-envelope artifact.
const ENVELOPE = /:\[\d/;

describe('serialization / optional-union JSON encoding (regression)', () => {
  it('optional boolean → plain boolean, never [index, value]', () => {
    const clone = createJsonEncoderFn<{active?: boolean}>();
    const direct = createJsonEncoderFn<{active?: boolean}>(undefined, {strategy: 'direct'});
    const mutate = createJsonEncoderFn<{active?: boolean}>(undefined, {strategy: 'mutate'});

    for (const enc of [clone, direct, mutate]) {
      expect(enc({active: false})).toBe('{"active":false}');
      expect(enc({active: true})).toBe('{"active":true}');
      expect(enc({})).toBe('{}');
      expect(enc({active: false})).not.toMatch(ENVELOPE);
    }
  });

  it('required literal-string union → plain string, no dispatch envelope', () => {
    const clone = createJsonEncoderFn<{x: 'a' | 'b' | 'c'}>();
    const direct = createJsonEncoderFn<{x: 'a' | 'b' | 'c'}>(undefined, {strategy: 'direct'});

    expect(clone({x: 'b'})).toBe('{"x":"b"}');
    expect(direct({x: 'c'})).toBe('{"x":"c"}');
    expect(clone({x: 'a'})).not.toMatch(ENVELOPE);
    expect(direct({x: 'a'})).not.toMatch(ENVELOPE);
  });

  it('optional string | number union → plain value, no envelope', () => {
    const clone = createJsonEncoderFn<{x?: string | number}>();
    expect(clone({x: 'hi'})).toBe('{"x":"hi"}');
    expect(clone({x: 7})).toBe('{"x":7}');
    expect(clone({})).toBe('{}');
    expect(clone({x: 'hi'})).not.toMatch(ENVELOPE);
    expect(clone({x: 7})).not.toMatch(ENVELOPE);
  });

  it('optional T | null keeps null and encodes plainly', () => {
    const clone = createJsonEncoderFn<{x?: string | null}>();
    expect(clone({x: null})).toBe('{"x":null}');
    expect(clone({x: 'hi'})).toBe('{"x":"hi"}');
    expect(clone({})).toBe('{}');
    expect(clone({x: null})).not.toMatch(ENVELOPE);
  });

  it('optional boolean | null keeps null and encodes plainly', () => {
    const clone = createJsonEncoderFn<{x?: boolean | null}>();
    expect(clone({x: null})).toBe('{"x":null}');
    expect(clone({x: true})).toBe('{"x":true}');
    expect(clone({})).toBe('{}');
    expect(clone({x: null})).not.toMatch(ENVELOPE);
    expect(clone({x: false})).not.toMatch(ENVELOPE);
  });

  it('optional boolean in a tuple slot → plain array element, no nested envelope', () => {
    const clone = createJsonEncoderFn<{t: [string, boolean?]}>();
    expect(clone({t: ['a', true]})).toBe('{"t":["a",true]}');
    expect(clone({t: ['a', false]})).toBe('{"t":["a",false]}');
    expect(clone({t: ['a']})).toBe('{"t":["a"]}');
  });

  it('all shapes still round-trip through the decoder', () => {
    const encBool = createJsonEncoderFn<{active?: boolean}>();
    const decBool = createJsonDecoderFn<{active?: boolean}>();
    expect(decBool(encBool({active: false})!)).toEqual({active: false});
    expect(decBool(encBool({active: true})!)).toEqual({active: true});
    expect(decBool(encBool({})!)).toEqual({});

    const encNull = createJsonEncoderFn<{x?: string | null}>();
    const decNull = createJsonDecoderFn<{x?: string | null}>();
    expect(decNull(encNull({x: null})!)).toEqual({x: null});
    expect(decNull(encNull({x: 'hi'})!)).toEqual({x: 'hi'});
    expect(decNull(encNull({})!)).toEqual({});
  });
});

// Schema-form (value-first RT.optional) counterpart of the cases above. An
// optional property authored with RT.optional(...) — including a FORMAT child
// like TF.string() — must encode as an OPTIONAL PROPERTY (key omitted when
// undefined), byte-identical to the type-first `x?:` form, NOT the [index,value]
// union envelope. Regression for the divergence where a schema optional resolved
// as a `string | undefined` union (surfaced in the playground before it fed the
// resolver the real ts-runtypes sources); the type-first cases above never
// exercised the value-first surface.
describe('serialization / schema-form optional JSON encoding (regression)', () => {
  it('RT.optional(TF.string()) → optional property, no envelope', () => {
    const enc = createJsonEncoderFn(RT.object({id: TF.string(), note: RT.optional(TF.string())}));
    expect(enc({id: 'x'})).toBe('{"id":"x"}'); // note omitted when absent
    expect(enc({id: 'x', note: 'hi'})).toBe('{"id":"x","note":"hi"}');
    expect(enc({id: 'x'})).not.toMatch(ENVELOPE);
    expect(enc({id: 'x', note: 'hi'})).not.toMatch(ENVELOPE);
  });

  it('RT.optional(RT.boolean()) → plain boolean, never [index, value]', () => {
    const enc = createJsonEncoderFn(RT.object({active: RT.optional(RT.boolean())}));
    expect(enc({active: false})).toBe('{"active":false}');
    expect(enc({active: true})).toBe('{"active":true}');
    expect(enc({})).toBe('{}');
    expect(enc({active: false})).not.toMatch(ENVELOPE);
  });

  // Marker coverage rule: both getRunTypeId shapes — reflection getRunTypeId(schema)
  // and static getRunTypeId<T>() — must land on ONE id, i.e. the schema optional
  // models `note?: string`, not a `string | undefined` union.
  it('schema optional converges with type-first on one id (reflect + static)', () => {
    const schema = RT.object({id: TF.string(), note: RT.optional(TF.string())});
    const reflectId = getRunTypeId(schema);
    const staticId = getRunTypeId<{id: string; note?: string}>();
    expect(reflectId).toBe(staticId);
  });

  it('schema optionals still round-trip through the decoder', () => {
    const enc = createJsonEncoderFn(RT.object({note: RT.optional(TF.string())}));
    const dec = createJsonDecoderFn(RT.object({note: RT.optional(TF.string())}));
    expect(dec(enc({note: 'hi'})!)).toEqual({note: 'hi'});
    expect(dec(enc({})!)).toEqual({});
  });
});
