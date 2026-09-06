/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Inheritance inside a union: a base class and its subclass BOTH declared, `Sub | Base`.
//
// Pinned rule: the union picks a class arm by exact constructor, so a registered subclass
// encodes under its own arm with every field it declares and comes back as itself, whatever
// order the checker listed the members in. An unregistered subclass takes the structural road:
// its arm still wins (its shape is the more specific one) and it decodes to a plain object, the
// documented unregistered behaviour. A value of a class the signature does not name is a type
// error, not a supported path, so no test here encodes a subclass through a base-only type.
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
class AuthErr extends BaseErr {
  constructor(
    type: string,
    public scope: string,
    public retryAfter: number
  ) {
    super(type);
  }
}
type SubFirst = string | AuthErr | BaseErr;
type BaseFirst = string | BaseErr | AuthErr;

const registerBase = () => registerClassSerializer(BaseErr, {deserialize: (d) => new BaseErr(d.type)});
const registerSub = () => registerClassSerializer(AuthErr, {deserialize: (d) => new AuthErr(d.type, d.scope, d.retryAfter)});
const auth = () => new AuthErr('not-authorized', 'admin', 30);
const paths = (errors: {path: unknown[]}[]) => errors.map((e) => e.path.map(String).join('.')).sort();

describe('classSerializer / a base class and its subclass declared in one union', () => {
  it('static (JSON) — each registered class rides its own arm and comes back as itself, in either member order', () => {
    registerBase();
    registerSub();
    for (const [encode, decode] of [
      [createJsonEncoderFn<SubFirst>(), createJsonDecoderFn<SubFirst>()],
      [createJsonEncoderFn<BaseFirst>(), createJsonDecoderFn<BaseFirst>()],
    ] as const) {
      const wire = encode(auth()) as string;
      expect(wire).toContain('"scope":"admin"');
      expect(wire).toContain('"retryAfter":30');
      const sub = decode(wire) as AuthErr;
      expect(sub).toBeInstanceOf(AuthErr);
      expect(sub.scope).toBe('admin');
      expect(sub.retryAfter).toBe(30);
      const base = decode(encode(new BaseErr('soft')) as string) as BaseErr;
      expect(base).toBeInstanceOf(BaseErr);
      expect(base).not.toBeInstanceOf(AuthErr);
      expect(decode(encode('plain') as string)).toBe('plain');
    }
  });

  it('reflect (binary) — the same through the value-first form', () => {
    registerBase();
    registerSub();
    const sample: BaseFirst = new BaseErr('x');
    const encode = createBinaryEncoderFn(sample);
    const decode = createBinaryDecoderFn(sample);
    const sub = decode(encode(auth())) as AuthErr;
    expect(sub).toBeInstanceOf(AuthErr);
    expect(sub.scope).toBe('admin');
    expect(decode(encode(new BaseErr('soft')))).toBeInstanceOf(BaseErr);
  });

  it('static (JSON) — an unregistered subclass takes the structural road: its own arm, a plain object back', () => {
    registerBase();
    for (const [encode, decode] of [
      [createJsonEncoderFn<SubFirst>(), createJsonDecoderFn<SubFirst>()],
      [createJsonEncoderFn<BaseFirst>(), createJsonDecoderFn<BaseFirst>()],
    ] as const) {
      const wire = encode(auth()) as string;
      expect(wire).toContain('"scope":"admin"');
      const sub = decode(wire) as AuthErr;
      expect(sub).not.toBeInstanceOf(BaseErr);
      expect(sub.type).toBe('not-authorized');
      expect(sub.scope).toBe('admin');
      expect(sub.retryAfter).toBe(30);
      expect(decode(encode(new BaseErr('soft')) as string)).toBeInstanceOf(BaseErr);
    }
  });

  it('reflect — validation accepts both, and a key neither class declares is unknown at the root and inside the union alike', () => {
    registerBase();
    registerSub();
    const sample: BaseFirst = new BaseErr('x');
    expect(createValidateFn(sample)(auth())).toBe(true);
    expect(createValidateFn(sample)(new BaseErr('x'))).toBe(true);
    const stray = {type: 'x', scope: 'admin', retryAfter: 30, bogus: 1};
    expect(createHasUnknownKeysFn(sample)(stray)).toBe(true);
    expect(createHasUnknownKeysFn<AuthErr>()(stray)).toBe(true);
    expect(paths(createUnknownKeyErrorsFn(sample)(stray))).toEqual(['bogus']);
    expect(paths(createUnknownKeyErrorsFn<AuthErr>()(stray))).toEqual(['bogus']);
    expect(createHasUnknownKeysFn(sample)(auth())).toBe(false);
    expect(createUnknownKeyErrorsFn(sample)(new BaseErr('x'))).toEqual([]);
  });

  it("static — the decoder's default 'strip' drops a stray key inside the union like at the root", () => {
    registerBase();
    registerSub();
    const wire = createJsonEncoderFn<BaseFirst>(undefined, {strategy: 'mutate'})(Object.assign(auth(), {bogus: 1})) as string;
    expect(wire).toContain('"bogus":1');
    const back = createJsonDecoderFn<BaseFirst>()(wire) as AuthErr & {bogus?: number};
    expect(back).toBeInstanceOf(AuthErr);
    expect(back.scope).toBe('admin');
    expect(back.bogus).toBeUndefined();
    const root = createJsonDecoderFn<AuthErr>()('{"type":"x","scope":"s","retryAfter":1,"bogus":1}') as AuthErr & {
      bogus?: number;
    };
    expect(root.bogus).toBeUndefined();
  });

  it('static — a wire object never smuggles __proto__ onto the rebuilt instance', () => {
    registerBase();
    const decode = createJsonDecoderFn<BaseErr>(undefined, {strategy: 'preserve'});
    const back = decode('{"type":"x","__proto__":{"polluted":true}}') as BaseErr & {polluted?: boolean};
    expect(back).toBeInstanceOf(BaseErr);
    expect(back.polluted).toBeUndefined();
  });
});
