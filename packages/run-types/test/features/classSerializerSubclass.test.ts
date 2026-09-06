/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A subclass of a REGISTERED class, itself unregistered, returned where the base is declared.
//
// Pinned rule: the value is not the declared class (its constructor differs), so the class lane
// does not claim it; it takes the structural road like any value of the declared shape. The
// declared fields ride and the declared class comes back. The fields the subclass added are
// undeclared keys, and every unknown-key function agrees on that whatever the position: the
// `clone` encoder builds the declared shape without them, `mutate` leaves them where they are,
// the decoder's `strip` removes them, `hasUnknownKeys` and `unknownKeyErrors` report them.
//
// Marker rule (CLAUDE.md): every case exercises BOTH createXxx<T>() (static) and
// createXxx(value) (reflect).

import {afterEach, describe, expect, it} from 'vitest';
import {
  createJsonEncoderFn,
  createJsonDecoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  createValidateFn,
  createHasUnknownKeysFn,
  createUnknownKeyErrorsFn,
  registerClassSerializer,
} from '@mionjs/run-types';
import {clearClassSerializers} from '../../src/runtypes/classSerializerRegistry.ts';

afterEach(() => {
  clearClassSerializers();
});

class BaseErr {
  constructor(public type: string) {}
}
// NOT registered: adds fields the base does not declare
class AuthErr extends BaseErr {
  constructor(
    type: string,
    public scope: string,
    public retryAfter: number
  ) {
    super(type);
  }
}
type Gate = string | BaseErr;

function registerBase(): void {
  registerClassSerializer(BaseErr, {deserialize: (d) => new BaseErr(d.type)});
}

const auth = () => new AuthErr('not-authorized', 'admin', 30);
const paths = (errors: {path: unknown[]}[]) => errors.map((e) => e.path.map(String).join('.')).sort();

describe('classSerializer / an unregistered subclass returned where its registered base is declared', () => {
  it('static (JSON) — encodes as the declared class, the added fields are left off the wire', () => {
    registerBase();
    const encode = createJsonEncoderFn<Gate>();
    const decode = createJsonDecoderFn<Gate>();
    const wire = encode(auth()) as string;
    expect(wire).toBe('[1,{"type":"not-authorized"}]');
    const back = decode(wire) as AuthErr;
    expect(back).toBeInstanceOf(BaseErr);
    expect(back).not.toBeInstanceOf(AuthErr);
    expect(back.type).toBe('not-authorized');
    expect(back.scope).toBeUndefined();
    expect(decode(encode('plain') as string)).toBe('plain');
  });

  it('reflect (binary) — encodes as the declared class', () => {
    registerBase();
    const sample: Gate = new BaseErr('x');
    const encode = createBinaryEncoderFn(sample);
    const decode = createBinaryDecoderFn(sample);
    const back = decode(encode(auth())) as AuthErr;
    expect(back).toBeInstanceOf(BaseErr);
    expect(back.type).toBe('not-authorized');
    expect(back.scope).toBeUndefined();
  });

  it('static — a non-union base slot behaves the same', () => {
    registerBase();
    const wire = createJsonEncoderFn<BaseErr>()(auth()) as string;
    expect(wire).toBe('{"type":"not-authorized"}');
    const back = createJsonDecoderFn<BaseErr>()(wire) as AuthErr;
    expect(back).toBeInstanceOf(BaseErr);
    expect(back.scope).toBeUndefined();
  });

  it("static — the 'mutate' encoder leaves the added fields in place, and the decoder's 'preserve' hands them to deserialize", () => {
    // preserve passes the wire object through untouched, so a deserialize that copies it keeps them
    registerClassSerializer(BaseErr, {deserialize: (d) => Object.assign(new BaseErr(d.type), d)});
    const value = auth();
    const wire = createJsonEncoderFn<BaseErr>(undefined, {strategy: 'mutate'})(value) as string;
    expect(wire).toContain('"scope":"admin"');
    expect(createJsonDecoderFn<BaseErr>()(wire)).toEqual(new BaseErr('not-authorized'));
    const kept = createJsonDecoderFn<BaseErr>(undefined, {strategy: 'preserve'})(wire) as AuthErr;
    expect(kept).toBeInstanceOf(BaseErr);
    expect(kept.scope).toBe('admin');
  });

  it('static — validation accepts the instance, the added fields are unknown keys at the root and inside a union', () => {
    registerBase();
    expect(createValidateFn<Gate>()(auth())).toBe(true);
    expect(createValidateFn<BaseErr>()(auth())).toBe(true);
    // one rule, whoever asks
    expect(createHasUnknownKeysFn<BaseErr>()(auth())).toBe(true);
    expect(createHasUnknownKeysFn<Gate>()(auth())).toBe(true);
    expect(createHasUnknownKeysFn<Gate>()('plain')).toBe(false);
    expect(paths(createUnknownKeyErrorsFn<BaseErr>()(auth()))).toEqual(['retryAfter', 'scope']);
    expect(paths(createUnknownKeyErrorsFn<Gate>()(auth()))).toEqual(['retryAfter', 'scope']);
    expect(createUnknownKeyErrorsFn<Gate>()('plain')).toEqual([]);
    // and none of them flags a clean instance
    expect(createHasUnknownKeysFn<Gate>()(new BaseErr('x'))).toBe(false);
    expect(createUnknownKeyErrorsFn<Gate>()(new BaseErr('x'))).toEqual([]);
  });

  it('reflect — the same answers through the value-first form', () => {
    registerBase();
    const sample: Gate = new BaseErr('x');
    expect(createValidateFn(sample)(auth())).toBe(true);
    expect(createHasUnknownKeysFn(sample)(auth())).toBe(true);
    expect(createUnknownKeyErrorsFn(sample)(auth()).length).toBe(2);
    expect(createHasUnknownKeysFn(sample)(new BaseErr('x'))).toBe(false);
  });

  it("static — the decoder's default 'strip' drops an undeclared key at the root and inside a union alike", () => {
    registerBase();
    const rootWire = createJsonEncoderFn<BaseErr>(undefined, {strategy: 'mutate'})(auth()) as string;
    expect((createJsonDecoderFn<BaseErr>()(rootWire) as AuthErr).scope).toBeUndefined();
    const unionWire = '[1,{"type":"not-authorized","scope":"admin"}]';
    const unionBack = createJsonDecoderFn<Gate>()(unionWire) as AuthErr;
    expect(unionBack).toBeInstanceOf(BaseErr);
    expect(unionBack.scope).toBeUndefined();
  });

  it('static — a wire object never smuggles __proto__ onto the rebuilt instance', () => {
    registerBase();
    const decode = createJsonDecoderFn<BaseErr>(undefined, {strategy: 'preserve'});
    const back = decode('{"type":"x","__proto__":{"polluted":true}}') as BaseErr & {polluted?: boolean};
    expect(back).toBeInstanceOf(BaseErr);
    expect(back.polluted).toBeUndefined();
  });
});
