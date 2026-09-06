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
// back on the decoded value. Dropping them silently or rejecting them as unknown keys is the
// behaviour this file forbids.
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

function registerBase(): void {
  registerClassSerializer(BaseErr, {deserialize: (d) => Object.assign(new BaseErr(d.type), d)});
}

const auth = () => new AuthErr('not-authorized', 'admin', 30);

describe('classSerializer / an unregistered subclass returned where its registered base is declared', () => {
  it('static (JSON) — the subclass fields ride the wire and come back', () => {
    registerBase();
    const encode = createJsonEncoderFn<Gate>();
    const decode = createJsonDecoderFn<Gate>();
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
    expect(validate(createJsonDecoderFn<Gate>()(wire))).toBe(true);
  });

  it('reflect — validation accepts the instance', () => {
    registerBase();
    const validate = createValidateFn(new BaseErr('x') as Gate);
    expect(validate(auth())).toBe(true);
  });

  it('static — a non-union base slot behaves the same', () => {
    registerBase();
    const encode = createJsonEncoderFn<BaseErr>();
    const decode = createJsonDecoderFn<BaseErr>();
    const wire = encode(auth()) as string;
    expect(wire).toContain('"scope":"admin"');
    const back = decode(wire) as AuthErr;
    expect(back).toBeInstanceOf(BaseErr);
    expect(back.scope).toBe('admin');
    expect(back.retryAfter).toBe(30);
  });
});
