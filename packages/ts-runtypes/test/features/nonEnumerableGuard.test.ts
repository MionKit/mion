// Runtime-enumerability guard for global-inherited + `@nonEnumerable` props. A guarded
// property's by-name write is gated on a runtime own-enumerability check
// (`Object.prototype.propertyIsEnumerable`, JSON.stringify semantics) in the
// families that build output by name (prepareForJsonSafe / stringifyJson /
// compactForJson / toBinary). The guard invariant is GUARDED ⇒ OPTIONAL-in-type,
// so DataOnly<T> is sound by construction: a member is guarded only when the
// type already permits its absence. A `@nonEnumerable` tag therefore takes effect
// only on an OPTIONAL property; on a required one it is a no-op (the NE lint rule
// flags that). Guarded props are optional to validators / the decode presence
// path.
//
// (Marker coverage rule: both getRunTypeId call shapes, converging + hash-equal.)

import {describe, expect, it} from 'vitest';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  getRunType,
  getRunTypeId,
  type RunType,
} from '@ts-runtypes/core';

// `@nonEnumerable` on an OPTIONAL property → guarded (and DataOnly-safe: the
// type already allows it to be absent).
interface Doc {
  id: string;
  /** @nonEnumerable */
  secret?: string;
}

function withSecret(enumerable: boolean): Doc {
  const doc = {id: 'd1'} as Doc;
  Object.defineProperty(doc, 'secret', {value: 'shhh', enumerable, writable: true, configurable: true});
  return doc;
}

// Encoder strategy paired with a decoder that reads its wire.
const STRATEGY_PAIRS = [
  {encode: 'clone', decode: 'strip'},
  {encode: 'mutate', decode: 'preserve'},
  {encode: 'direct', decode: 'strip'},
  {encode: 'compact', decode: 'compact'},
] as const;

describe('@nonEnumerable guard on an optional prop — JSON strategies', () => {
  for (const {encode: encStrategy, decode: decStrategy} of STRATEGY_PAIRS) {
    it(`[${encStrategy}] non-enumerable secret is dropped; enumerable secret is kept`, () => {
      const encode = createJsonEncoderFn<Doc>(undefined, {strategy: encStrategy});
      const decode = createJsonDecoderFn<Doc>(undefined, {strategy: decStrategy});

      const hidden = decode(encode(withSecret(false)) as string) as Record<string, unknown>;
      expect(hidden.id).toBe('d1');
      expect(hidden.secret).toBeUndefined();

      const shown = decode(encode(withSecret(true)) as string) as Record<string, unknown>;
      expect(shown.id).toBe('d1');
      expect(shown.secret).toBe('shhh');
    });
  }

  it('binary round-trip honors the guard both ways', () => {
    const encode = createBinaryEncoderFn<Doc>();
    const decode = createBinaryDecoderFn<Doc>();
    expect((decode(encode(withSecret(false))) as Record<string, unknown>).secret).toBeUndefined();
    expect((decode(encode(withSecret(true))) as Record<string, unknown>).secret).toBe('shhh');
  });

  it('validators treat the guarded prop as optional; DataOnly-safe', () => {
    const isDoc = createValidateFn<Doc>();
    const errorsOf = createGetValidationErrorsFn<Doc>();
    expect(isDoc({id: 'd1'})).toBe(true); // secret absent
    expect(isDoc({id: 'd1', secret: 'x'})).toBe(true);
    expect(errorsOf({id: 'd1'})).toHaveLength(0);
    // validate(decode(encode(v))) holds for a non-enumerable value.
    const encode = createJsonEncoderFn<Doc>();
    const decode = createJsonDecoderFn<Doc>();
    expect(isDoc(decode(encode(withSecret(false)) as string))).toBe(true);
  });

  it('reflection exposes nonEnumerable + optional on the tagged member only', () => {
    const node = getRunType<Doc>();
    const kids = (node.children ?? []) as RunType[];
    const secret = kids.find((child) => child.name === 'secret');
    const id = kids.find((child) => child.name === 'id');
    expect(secret?.nonEnumerable).toBe(true);
    expect(secret?.optional).toBe(true);
    expect(id?.nonEnumerable).toBeFalsy();
    expect(id?.optional).toBeFalsy();
  });
});

// `@nonEnumerable` on a REQUIRED property is a no-op: guarding it would make the
// wire omit a prop the type marks present (breaking DataOnly), so the tag is
// ignored and the prop serializes unconditionally.
interface ReqTagged {
  a: string;
  /** @nonEnumerable */
  kept: string;
}

describe('@nonEnumerable on a required prop is a no-op (guard needs optional)', () => {
  it('a required tagged prop is NOT guarded — serialized unconditionally', () => {
    const encode = createJsonEncoderFn<ReqTagged>();
    const value = {a: 'x'} as ReqTagged;
    Object.defineProperty(value, 'kept', {value: 'v', enumerable: false, writable: true, configurable: true});
    const parsed = JSON.parse(encode(value) as string);
    expect(parsed.kept).toBe('v'); // written even though non-enumerable
    const node = getRunType<ReqTagged>();
    const kept = (node.children ?? []).find((child) => (child as RunType).name === 'kept') as RunType;
    expect(kept?.nonEnumerable).toBeFalsy(); // not guarded
    expect(kept?.optional).toBeFalsy();
  });
});

// A framework error: name/message are the REQUIRED envelope, always serialized;
// stack stays guarded (opt in per value to include it).
class RpcError extends Error {
  constructor(
    public readonly code: number,
    message: string
  ) {
    super(message);
  }
}

describe('Error envelope always rides the wire; stack stays guarded', () => {
  it('name/message serialize; stack does not (unless made enumerable)', () => {
    const encode = createJsonEncoderFn<RpcError>();
    const decode = createJsonDecoderFn<RpcError>();
    const decoded = decode(encode(new RpcError(500, 'boom')) as string) as Record<string, unknown>;
    expect(decoded.code).toBe(500);
    expect(typeof decoded.name).toBe('string');
    expect(decoded.message).toBe('boom');
    expect(decoded.stack).toBeUndefined();
  });

  it('marker: both getRunTypeId call shapes converge (hash equivalence)', () => {
    const staticId = getRunTypeId<RpcError>();
    const sample: RpcError = new RpcError(500, 'boom');
    expect(getRunTypeId(sample)).toBe(staticId);
  });
});
