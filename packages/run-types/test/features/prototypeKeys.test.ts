// Pins the one rule for prototype-named wire keys on both roads: a key named
// `__proto__`, `prototype` or `constructor` is refused by every decoder at
// decode time with one message, refused by validate for a value that never
// went through a decoder, and skipped by every encoder and clone that rebuilds
// an object from its keys. Writing `__proto__` on a fresh `{}` swaps its
// prototype and the key vanishes from `Object.keys`, so before this rule a
// body such as `{"__proto__": {"admin": true}}` could come out of a clone or a
// re-encode as an object whose `admin` is inherited.
//
// Found by the audit of the generated code (the secjson lane's prototype
// oracle now covers the encoders and the cloner too); these are the seed-free
// repros.

import {describe, expect, it} from 'vitest';
import {
  createBinaryDecoderFn,
  createBinaryEncoderFn,
  createCloneExactShapeFn,
  createJsonDecoderFn,
  createJsonEncoderFn,
  createParseFn,
  createValidateFn,
  isSerializationError,
  registerClassSerializer,
  BinaryDecodeError,
  RTParseError,
} from '@mionjs/run-types';

const UNSAFE = ['__proto__', 'prototype', 'constructor'] as const;
const message = (key: string) => `[mion] Unsafe property name: ${key}`;

function varint(value: number): number[] {
  const out: number[] = [];
  let rest = value;
  do {
    let byte = rest % 128;
    rest = Math.floor(rest / 128);
    if (rest > 0) byte |= 0x80;
    out.push(byte);
  } while (rest > 0);
  return out;
}
const utf8 = (text: string) => [...new TextEncoder().encode(text)];
const bytes = (...parts: Array<number | number[]>) => Uint8Array.from(parts.flat());

type Bag = Record<string, unknown>;
type Counts = Record<string, number>;
// A Record whose values need a transform: the JSON decoders walk its keys
// (a Record of plain numbers is a no-op decoder, so its key reaches validate).
type Stamps = Record<string, Date>;

class Box {
  value = 0;
}
registerClassSerializer(Box, {serialize: (box) => ({value: box.value})});

describe('prototype-named wire keys are refused by the decoders on both roads', () => {
  const decoders = {
    strip: createJsonDecoderFn<Stamps>(undefined, {strategy: 'strip'}),
    preserve: createJsonDecoderFn<Stamps>(undefined, {strategy: 'preserve'}),
    compact: createJsonDecoderFn<Stamps>(undefined, {strategy: 'compact'}),
  };
  const parse = createParseFn<Stamps>();
  const parseBag = createParseFn<Bag>();
  const decodeBag = createJsonDecoderFn<Bag>();
  const validateBag = createValidateFn<Bag>();
  const decodeBinary = createBinaryDecoderFn<Counts>();

  for (const key of UNSAFE) {
    const wire = `{"a":"2024-01-01T00:00:00.000Z",${JSON.stringify(key)}:{"admin":true}}`;

    it(`JSON decoders that walk the keys throw '${message(key)}'`, () => {
      for (const [name, decode] of Object.entries(decoders)) {
        expect(() => decode(wire), name).toThrow(message(key));
      }
    });

    it(`parse reports the '${key}' key as a serialization error`, () => {
      let caught: unknown;
      try {
        parse(JSON.parse(wire));
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(RTParseError);
      const {issues} = caught as RTParseError;
      expect(isSerializationError(issues) && issues.deserializeError).toBe(message(key));
    });

    it(`a no-op decoder leaves the '${key}' key for validate, and parse still refuses it`, () => {
      // Record<string, unknown> has nothing to rebuild, so its decoder is the
      // identity; the key reaches validate, which refuses it.
      const bagWire = `{"a":1,${JSON.stringify(key)}:{"admin":true}}`;
      let value: unknown;
      try {
        value = decodeBag(bagWire);
      } catch (err) {
        expect((err as Error).message).toBe(message(key));
        return;
      }
      expect(validateBag(value)).toBe(false);
      expect(() => parseBag(JSON.parse(bagWire))).toThrow(RTParseError);
    });

    it(`the binary decoder throws BinaryDecodeError on a '${key}' key`, () => {
      // Index-signature wire: uint32 entry count, then (key, float64) pairs.
      const buffer = bytes([1, 0, 0, 0], varint(key.length), utf8(key), new Array(8).fill(0));
      expect(() => decodeBinary(buffer)).toThrow(BinaryDecodeError);
      expect(() => decodeBinary(buffer)).toThrow(message(key));
    });
  }

  it('the valid wires still decode', () => {
    expect(decoders.preserve('{"a":"2024-01-01T00:00:00.000Z"}')).toEqual({a: new Date('2024-01-01T00:00:00.000Z')});
    expect(parseBag({a: 1})).toEqual({a: 1});
    expect(decodeBinary(createBinaryEncoderFn<Counts>()({a: 1}))).toEqual({a: 1});
  });
});

describe('prototype-named keys never validate under an index signature', () => {
  const validateBag = createValidateFn<Bag>();
  const validateCounts = createValidateFn<Counts>();

  for (const key of UNSAFE) {
    it(`an own '${key}' key fails validation, whatever its value`, () => {
      expect(validateBag(JSON.parse(`{"a":1,${JSON.stringify(key)}:{"admin":true}}`))).toBe(false);
      expect(validateCounts(JSON.parse(`{"a":1,${JSON.stringify(key)}:2}`))).toBe(false);
    });
  }

  it('an inherited constructor is not an own key and does not count', () => {
    expect(validateCounts({a: 1})).toBe(true);
    expect(validateBag({})).toBe(true);
  });
});

describe('the rebuilding encoders and the cloner skip prototype-named keys; the in-place ones carry them to a wire the decoders refuse', () => {
  const poisoned = () => JSON.parse('{"a":1,"constructor":2,"prototype":3,"__proto__":{"admin":true}}') as Counts;
  // A Record whose values the in-place encoder must rewrite (a bigint has no
  // JSON form), so every strategy walks the keys.
  type Ledger = Record<string, bigint>;
  const poisonedLedger = () => {
    const value = JSON.parse('{"constructor":1,"prototype":2,"__proto__":{"admin":true}}') as Record<string, unknown>;
    value.a = 5n;
    return value as Ledger;
  };
  const ledgerEncoders = {
    clone: createJsonEncoderFn<Ledger>(undefined, {strategy: 'clone'}),
    mutate: createJsonEncoderFn<Ledger>(undefined, {strategy: 'mutate'}),
    direct: createJsonEncoderFn<Ledger>(undefined, {strategy: 'direct'}),
    compact: createJsonEncoderFn<Ledger>(undefined, {strategy: 'compact'}),
  };

  it('the rebuilding JSON encoders leave the three out of the wire', () => {
    // `clone` and `compact` write wire keys onto a fresh object, the one place
    // an own `__proto__` key would swap a prototype, so they carry the guard.
    for (const strategy of ['clone', 'compact'] as const) {
      const text = ledgerEncoders[strategy](poisonedLedger()) as string;
      expect(Object.keys(JSON.parse(text)), strategy).toEqual(['a']);
    }
  });

  it('the in-place JSON encoders carry the keys through, and the decoders refuse that wire', () => {
    // `mutate` rewrites values on the object you passed and `direct` prints
    // it: neither writes a key onto another object, so neither pays a compare
    // per key. The receiving decoder is the guard.
    for (const strategy of ['mutate', 'direct'] as const) {
      const text = ledgerEncoders[strategy](poisonedLedger()) as string;
      expect(Object.keys(JSON.parse(text)), strategy).toContain('constructor');
      expect(() => createJsonDecoderFn<Ledger>()(text), strategy).toThrow(message('constructor'));
    }
  });

  it('the rebuilding encoders leave them out even when the values need no transform', () => {
    for (const strategy of ['clone', 'compact'] as const) {
      const encode = createJsonEncoderFn<Counts>(undefined, {strategy});
      expect(Object.keys(JSON.parse(encode(poisoned()) as string)), strategy).toEqual(['a']);
    }
  });

  it('the binary encoder carries the keys, and the binary decoder refuses the frame', () => {
    const encode = createBinaryEncoderFn<Counts>();
    const decode = createBinaryDecoderFn<Counts>();
    expect(() => decode(encode(poisoned()))).toThrow(BinaryDecodeError);
  });

  it('the exact-shape clone keeps a plain prototype and no inherited admin', () => {
    const clone = createCloneExactShapeFn<Counts>();
    const out = clone(poisoned()) as Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.keys(out)).toEqual(['a']);
    expect(out.admin).toBeUndefined();
  });

  it('the global Object.prototype is untouched', () => {
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });
});

describe('Map keys and Set members are values, never property names', () => {
  // `new Map([['__proto__', 1]])` stores a plain string key: nothing walks a
  // prototype chain to read it, so the three names are ordinary data here on
  // both roads. A Record nested inside a Map value is still refused.
  interface Bags {
    counts: Map<string, number>;
    names: Set<string>;
  }
  const value = (): Bags => ({
    counts: new Map(UNSAFE.map((key, i) => [key, i + 1] as [string, number])),
    names: new Set(UNSAFE),
  });

  it('round-trip through JSON with the three names as Map keys and Set members', () => {
    for (const strategy of ['clone', 'mutate', 'direct'] as const) {
      const encode = createJsonEncoderFn<Bags>(undefined, {strategy});
      const decode = createJsonDecoderFn<Bags>(undefined, {strategy: 'preserve'});
      const out = decode(encode(value()) as string);
      expect(out, strategy).toEqual(value());
      expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
      expect(createValidateFn<Bags>()(out)).toBe(true);
    }
    expect(createParseFn<Bags>()(JSON.parse(createJsonEncoderFn<Bags>()(value()) as string))).toEqual(value());
  });

  it('round-trip through binary the same way', () => {
    const out = createBinaryDecoderFn<Bags>()(createBinaryEncoderFn<Bags>()(value()));
    expect(out).toEqual(value());
  });

  it('a Record inside a Map value is still refused', () => {
    type Nested = Map<string, Record<string, Date>>;
    const decode = createJsonDecoderFn<Nested>();
    expect(() => decode('[["k",{"__proto__":{"admin":true}}]]')).toThrow(message('__proto__'));
    expect(decode('[["k",{"a":"2024-01-01T00:00:00.000Z"}]]').get('k')?.a).toBeInstanceOf(Date);
  });
});

describe('class deserialization sets the declared properties only, never the keys on the wire', () => {
  it('an undeclared key on the body never lands on the instance, whatever the strategy', () => {
    for (const strategy of ['strip', 'preserve'] as const) {
      const decode = createJsonDecoderFn<Box>(undefined, {strategy});
      const out = decode('{"value":4,"extra":9}') as Box & Record<string, unknown>;
      expect(out, strategy).toBeInstanceOf(Box);
      expect(out.value, strategy).toBe(4);
      expect(Object.prototype.hasOwnProperty.call(out, 'extra'), strategy).toBe(false);
    }
  });

  it('a JSON body cannot swap the prototype of a rebuilt instance', () => {
    const decode = createJsonDecoderFn<Box>();
    const out = decode('{"value":1,"__proto__":{"admin":true},"constructor":5}') as Box & Record<string, unknown>;
    expect(out).toBeInstanceOf(Box);
    expect(Object.getPrototypeOf(out)).toBe(Box.prototype);
    expect(out.value).toBe(1);
    expect(out.admin).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(out, 'constructor')).toBe(false);
  });

  it('a binary frame written by a custom serializer cannot swap it either', () => {
    // A registered `serialize` writes one JSON string frame on the binary
    // wire: varint length, then the text.
    const decode = createBinaryDecoderFn<Box>();
    const text = '{"value":2,"__proto__":{"admin":true}}';
    const out = decode(bytes(varint(text.length), utf8(text))) as Box & Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Box.prototype);
    expect(out.value).toBe(2);
    expect(out.admin).toBeUndefined();
    expect(decode(createBinaryEncoderFn<Box>()(Object.assign(new Box(), {value: 3}))).value).toBe(3);
  });
});

describe('inherited prototype slots are never declared members', () => {
  // Every object inherits `constructor` from Object.prototype, a class instance
  // reaches `prototype` through its constructor, and Error carries both. None
  // of that is a DECLARED member: were the scan ever to copy an inherited slot
  // into the type, every one of these types would fail the build (UPN001) and
  // the decoders would read `v.constructor` through the prototype chain. So
  // the compiled functions must exist and behave, whatever the globals do.
  interface HttpError extends Error {
    status: number;
  }
  const isBox = createValidateFn<Box>();
  const isHttpError = createValidateFn<HttpError>();
  const decodeBox = createJsonDecoderFn<Box>();
  const decodeHttpError = createJsonDecoderFn<HttpError>();

  it('a class instance type compiles and validates by its own members only', () => {
    expect(isBox(Object.assign(new Box(), {value: 2}))).toBe(true);
    const out = decodeBox('{"value":7}');
    expect(out).toBeInstanceOf(Box);
    expect(Object.keys(out)).toEqual(['value']);
  });

  it('a type extending Error compiles and validates by its declared members only', () => {
    expect(isHttpError({name: 'HttpError', message: 'nope', status: 404})).toBe(true);
    expect(isHttpError({name: 'HttpError', message: 'nope'})).toBe(false);
    const out = decodeHttpError('{"name":"HttpError","message":"nope","status":500}') as Record<string, unknown>;
    expect(out.status).toBe(500);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(out, 'constructor')).toBe(false);
  });
});
