/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A subclass of a REGISTERED class, itself unregistered, returned where the base is declared.
//
// Pinned rule: the value is a real instance of the base (`instanceof` holds), so it is routed
// to the base's arm. That arm must carry EVERY own property the instance has, not only the
// fields the base declares: the subclass's fields ride the wire, pass validation, and come
// back on the decoded value. Dropping them silently on encode is the behaviour this file
// forbids. On decode the JSON decoder's documented `strategy` still rules: the default
// `'strip'` blanks undeclared keys before restore, `'preserve'` keeps them.
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

// the registered deserialize rebuilds the declared shape only; the framework copies the
// extras back afterwards (never a key named __proto__, constructor or prototype)
function registerBase(): void {
  registerClassSerializer(BaseErr, {deserialize: (d) => new BaseErr(d.type)});
}

const auth = () => new AuthErr('not-authorized', 'admin', 30);

describe('classSerializer / an unregistered subclass returned where its registered base is declared', () => {
  it('static (JSON) — the subclass fields ride the wire and come back', () => {
    registerBase();
    const encode = createJsonEncoderFn<Gate>();
    const decode = createJsonDecoderFn<Gate>(undefined, {strategy: 'preserve'});
    const wire = encode(auth()) as string;
    expect(wire).toContain('"scope":"admin"');
    expect(wire).toContain('"retryAfter":30');
    const back = decode(wire) as AuthErr;
    expect(back).toBeInstanceOf(BaseErr);
    expect(back.type).toBe('not-authorized');
    expect(back.scope).toBe('admin');
    expect(back.retryAfter).toBe(30);
  });

  it('reflect (binary) — the subclass fields ride the wire and come back', () => {
    registerBase();
    const sample: Gate = new BaseErr('x');
    const encode = createBinaryEncoderFn(sample);
    const decode = createBinaryDecoderFn(sample);
    const back = decode(encode(auth())) as AuthErr;
    expect(back).toBeInstanceOf(BaseErr);
    expect(back.scope).toBe('admin');
    expect(back.retryAfter).toBe(30);
  });

  it('static — validation accepts the instance and its decoded form, extra fields are not unknown keys', () => {
    registerBase();
    const validate = createValidateFn<Gate>();
    expect(validate(auth())).toBe(true);
    const wire = createJsonEncoderFn<Gate>()(auth()) as string;
    expect(validate(createJsonDecoderFn<Gate>(undefined, {strategy: 'preserve'})(wire))).toBe(true);
  });

  it('reflect — validation accepts the instance', () => {
    registerBase();
    const validate = createValidateFn(new BaseErr('x') as Gate);
    expect(validate(auth())).toBe(true);
  });

  it('static — a non-union base slot behaves the same', () => {
    registerBase();
    const encode = createJsonEncoderFn<BaseErr>();
    const decode = createJsonDecoderFn<BaseErr>(undefined, {strategy: 'preserve'});
    const wire = encode(auth()) as string;
    expect(wire).toContain('"scope":"admin"');
    const back = decode(wire) as AuthErr;
    expect(back).toBeInstanceOf(BaseErr);
    expect(back.scope).toBe('admin');
    expect(back.retryAfter).toBe(30);
  });

  it("static — the decoder's default 'strip' strategy still drops them, as documented", () => {
    registerBase();
    const wire = createJsonEncoderFn<BaseErr>()(auth()) as string;
    const back = createJsonDecoderFn<BaseErr>()(wire) as AuthErr;
    expect(back).toBeInstanceOf(BaseErr);
    expect(back.scope).toBeUndefined();
    // the same answer inside a union: the class rides its own wire arm and strip reaches into it
    const unionWire = createJsonEncoderFn<Gate>()(auth()) as string;
    const unionBack = createJsonDecoderFn<Gate>()(unionWire) as AuthErr;
    expect(unionBack).toBeInstanceOf(BaseErr);
    expect(unionBack.type).toBe('not-authorized');
    expect(unionBack.scope).toBeUndefined();
    expect(createJsonDecoderFn<Gate>()(createJsonEncoderFn<Gate>()('plain') as string)).toBe('plain');
  });

  it('static — a subclass with no extra fields writes the plain shape, nothing extra rides', () => {
    registerBase();
    class SameShape extends BaseErr {}
    const wire = createJsonEncoderFn<BaseErr>()(new SameShape('plain')) as string;
    expect(wire).toBe('{"type":"plain"}');
    const sample: BaseErr = new BaseErr('x');
    const bytes = createBinaryEncoderFn(sample)(new SameShape('plain'));
    expect(createBinaryDecoderFn(sample)(bytes)).toEqual(new BaseErr('plain'));
  });

  it('static — a wire object never smuggles __proto__ onto the rebuilt instance', () => {
    registerBase();
    const decode = createJsonDecoderFn<BaseErr>(undefined, {strategy: 'preserve'});
    const back = decode('{"type":"x","__proto__":{"polluted":true},"scope":"ok"}') as AuthErr & {polluted?: boolean};
    expect(back).toBeInstanceOf(BaseErr);
    expect(back.polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(back, '__proto__')).toBe(false);
    expect(back.scope).toBe('ok');
  });
});
