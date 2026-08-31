// Error subclasses as wire types, under the runtime-enumerability guard. A member
// inherited from the default-lib `Error` global is guarded (its by-name write is
// gated on a runtime own-enumerability check, JSON.stringify semantics) ONLY when
// it is OPTIONAL in the type: `stack?` and `cause?`. The REQUIRED envelope
// members `name` / `message` are always serialized, so the error stays useful on
// the wire AND `DataOnly<Error>` (which marks them required) stays accurate. The
// guard invariant is: GUARDED ⇒ OPTIONAL-in-type, so a guarded member is never a
// prop the type promised is present. A vanilla `class X extends Error` therefore
// ships its envelope (name/message) but never its stack (no server-path leak),
// unless a value makes stack enumerable.
//
// (Marker coverage rule: both getRunTypeId call shapes, converging + hash-equal.)

import {describe, expect, it} from 'vitest';
import {
  createValidateFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  getRunType,
  getRunTypeId,
  type RunType,
} from '@mionjs/run-types';

class WireError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function wire(): WireError {
  const err = new WireError('not-found', 'missing thing');
  expect(typeof err.stack).toBe('string'); // the instance genuinely carries one
  return err;
}

describe('Error subclass wire projection — enumerability guard', () => {
  it('reflected node guards only the OPTIONAL inherited members (stack/cause)', () => {
    const node = getRunType<WireError>();
    const kids = (node.children ?? []) as RunType[];
    const by = (name: string) => kids.find((child) => child.name === name);
    // stack/cause are optional in Error → guarded + optional.
    for (const name of ['stack', 'cause']) {
      expect(by(name)?.nonEnumerable).toBe(true);
      expect(by(name)?.optional).toBe(true);
    }
    // name/message are REQUIRED in Error → NOT guarded, always serialized.
    for (const name of ['name', 'message', 'code']) {
      expect(by(name)?.nonEnumerable).toBeFalsy();
      expect(by(name)?.optional).toBeFalsy();
    }
  });

  it('vanilla error → envelope (name/message) + code ride the wire, never stack', () => {
    const encode = createJsonEncoderFn<WireError>();
    const parsed = JSON.parse(encode(wire()) as string);
    expect(parsed.code).toBe('not-found');
    expect(parsed.message).toBe('missing thing'); // required envelope, always written
    expect(typeof parsed.name).toBe('string'); // 'Error' (inherited), still written
    expect(parsed.stack).toBeUndefined(); // guarded, non-enumerable → dropped
    expect(parsed.cause).toBeUndefined();
  });

  it('a value that makes `stack` enumerable serializes it (per-value opt-in)', () => {
    const encode = createJsonEncoderFn<WireError>();
    const err = wire();
    Object.defineProperty(err, 'stack', {value: 'FRAME', enumerable: true, writable: true, configurable: true});
    const parsed = JSON.parse(encode(err) as string);
    expect(parsed.stack).toBe('FRAME');
    expect(parsed.message).toBe('missing thing');
  });

  it('binary round-trip carries the envelope, never stack', () => {
    const encode = createBinaryEncoderFn<WireError>();
    const decode = createBinaryDecoderFn<WireError>();
    const decoded = decode(encode(wire())) as Record<string, unknown>;
    expect(decoded.code).toBe('not-found');
    expect(decoded.message).toBe('missing thing');
    expect(decoded.stack).toBeUndefined();
  });

  it('inside a union, the error member still ships without stack', () => {
    type Result = WireError | {ok: true};
    const encode = createJsonEncoderFn<Result>();
    const decode = createJsonDecoderFn<Result>();
    const json = encode(wire()) as string;
    expect(json).not.toContain('FRAME');
    const decoded = decode(json) as Record<string, unknown>;
    expect(decoded.code).toBe('not-found');
    expect(decode(encode({ok: true}) as string)).toEqual({ok: true});
  });

  it('validate: envelope required, guarded stack/cause optional; round-trip holds', () => {
    const isError = createValidateFn<WireError>();
    expect(isError(wire())).toBe(true);
    // name/message are required (always on the wire), stack/cause may be absent.
    expect(isError({code: 'x', name: 'E', message: 'm'})).toBe(true);
    expect(isError({code: 'x'})).toBe(false); // missing required name/message
    // validate(decode(encode(v))) holds for a vanilla instance.
    const encode = createJsonEncoderFn<WireError>();
    const decode = createJsonDecoderFn<WireError>();
    expect(isError(decode(encode(wire()) as string))).toBe(true);
  });

  it('(static + reflect) both getRunTypeId call shapes converge', () => {
    const staticId = getRunTypeId<WireError>();
    const sample: WireError = wire();
    expect(getRunTypeId(sample)).toBe(staticId); // hash equivalence
  });
});
