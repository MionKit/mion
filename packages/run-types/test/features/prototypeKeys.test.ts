// Pins the rule for `__proto__`, split by POSITION, because the two positions
// are not the same question.
//
// As a WIRE KEY admitted by an index signature it is refused by every decoder
// with one message, refused by validate for a value that never went through a
// decoder, and skipped by every encoder and clone that rebuilds an object from
// its keys. Writing it on a fresh `{}` swaps that object's prototype and the key
// vanishes from `Object.keys`, so a body such as `{"__proto__": {"admin": true}}`
// could otherwise come out of a clone as an object whose `admin` is inherited.
//
// As a DECLARED member it is dropped, the way any member that cannot cross the
// wire is dropped, and the rest of the type keeps working.
//
// `prototype` and `constructor` are ORDINARY names in both positions. Measured:
// `r["constructor"] = v` and `r["prototype"] = v` are plain own keys that touch
// no prototype, and `({}).prototype` is undefined. The one thing `constructor`
// needs is an own-key presence test, since `({}).constructor` answers the Object
// function rather than undefined.

import {describe, expect, it, expectTypeOf} from 'vitest';
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
  type DataOnly,
} from '@mionjs/run-types';

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
// A Record whose values need a transform, next to the Bag above whose values
// need none: both decoders walk the keys.
type Stamps = Record<string, Date>;

class Box {
  value = 0;
}
registerClassSerializer(Box, {serialize: (box) => ({value: box.value})});

describe('a `__proto__` wire key is refused by the decoders on both roads', () => {
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
  const wire = `{"a":"2024-01-01T00:00:00.000Z","__proto__":{"admin":true}}`;

  it(`the JSON decoders that walk the keys throw '${message('__proto__')}'`, () => {
    for (const [name, decode] of Object.entries(decoders)) {
      expect(() => decode(wire), name).toThrow(message('__proto__'));
    }
  });

  it('parse reports the key as a serialization error', () => {
    let caught: unknown;
    try {
      parse(JSON.parse(wire));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RTParseError);
    const {issues} = caught as RTParseError;
    expect(isSerializationError(issues) && issues.deserializeError).toBe(message('__proto__'));
  });

  it('a decoder whose values need no rebuild still throws, and validate refuses it too', () => {
    // Record<string, unknown> has nothing to rebuild, but the key loop with the
    // refusal ships anyway: the decoder is a real function, never the JSON.parse
    // identity, and validate refuses the same key on a value that never went
    // through a decoder.
    const bagWire = '{"a":1,"__proto__":{"admin":true}}';
    expect(() => decodeBag(bagWire)).toThrow(message('__proto__'));
    expect(validateBag(JSON.parse(bagWire))).toBe(false);
    expect(() => parseBag(JSON.parse(bagWire))).toThrow(RTParseError);
  });

  it('the binary decoder throws BinaryDecodeError on the key', () => {
    // Index-signature wire: uint32 entry count, then (key, float64) pairs.
    const buffer = bytes([1, 0, 0, 0], varint('__proto__'.length), utf8('__proto__'), new Array(8).fill(0));
    expect(() => decodeBinary(buffer)).toThrow(BinaryDecodeError);
    expect(() => decodeBinary(buffer)).toThrow(message('__proto__'));
  });

  it('the valid wires still decode', () => {
    expect(decoders.preserve('{"a":"2024-01-01T00:00:00.000Z"}')).toEqual({a: new Date('2024-01-01T00:00:00.000Z')});
    expect(parseBag({a: 1})).toEqual({a: 1});
    expect(decodeBinary(createBinaryEncoderFn<Counts>()({a: 1}))).toEqual({a: 1});
  });
});

describe('`prototype` and `constructor` are ordinary wire keys a record carries', () => {
  // The cost the old rule charged: a Record<string, string> holding form fields,
  // tags or a translation map could not carry either name, and the request
  // failed on data the type declared as valid.
  type Fields = Record<string, string>;
  const wire = '{"name":"Leo","constructor":"builder","prototype":"draft"}';
  const expected = {name: 'Leo', constructor: 'builder', prototype: 'draft'};

  const decoders = {
    strip: createJsonDecoderFn<Fields>(undefined, {strategy: 'strip'}),
    preserve: createJsonDecoderFn<Fields>(undefined, {strategy: 'preserve'}),
    compact: createJsonDecoderFn<Fields>(undefined, {strategy: 'compact'}),
  };
  const encoders = {
    clone: createJsonEncoderFn<Fields>(undefined, {strategy: 'clone'}),
    mutate: createJsonEncoderFn<Fields>(undefined, {strategy: 'mutate'}),
    direct: createJsonEncoderFn<Fields>(undefined, {strategy: 'direct'}),
    compact: createJsonEncoderFn<Fields>(undefined, {strategy: 'compact'}),
  };

  it('every JSON decoder carries both keys through', () => {
    for (const [name, decode] of Object.entries(decoders)) {
      const out = decode(wire) as Record<string, unknown>;
      expect(out, name).toEqual(expected);
      expect(Object.getPrototypeOf(out), name).toBe(Object.prototype);
    }
  });

  it('every JSON encoder writes both keys onto the wire, and the round trip is lossless', () => {
    const decode = createJsonDecoderFn<Fields>();
    for (const [name, encode] of Object.entries(encoders)) {
      const text = encode({...expected}) as string;
      expect(Object.keys(JSON.parse(text)).sort(), name).toEqual(['constructor', 'name', 'prototype']);
      expect(decode(text), name).toEqual(expected);
    }
  });

  it('the binary road round-trips them too', () => {
    const out = createBinaryDecoderFn<Fields>()(createBinaryEncoderFn<Fields>()({...expected}));
    expect(out).toEqual(expected);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });

  it('validate accepts them, and parse and the exact-shape clone keep them', () => {
    const value = JSON.parse(wire) as Fields;
    expect(createValidateFn<Fields>()(value)).toBe(true);
    expect(createParseFn<Fields>()(value)).toEqual(expected);
    const cloned = createCloneExactShapeFn<Fields>()(value) as Record<string, unknown>;
    expect(cloned).toEqual(expected);
    expect(Object.getPrototypeOf(cloned)).toBe(Object.prototype);
  });

  it('a Record of values that need a transform carries them as well', () => {
    const decode = createJsonDecoderFn<Stamps>(undefined, {strategy: 'preserve'});
    const out = decode('{"constructor":"2024-01-01T00:00:00.000Z","prototype":"2024-06-01T00:00:00.000Z"}');
    expect(out.constructor).toBeInstanceOf(Date);
    expect(out.prototype).toBeInstanceOf(Date);
  });

  it('the global Object.prototype is untouched by any of it', () => {
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
    expect(({} as Record<string, unknown>).builder).toBeUndefined();
  });
});

describe('a declared `__proto__` member is dropped, and the rest of the type works', () => {
  interface Wire {
    ok: number;
    __proto__: string;
  }
  const value = {ok: 1} as unknown as Wire;

  it('the member is absent from the wire and from the decoded value', () => {
    const encode = createJsonEncoderFn<Wire>(undefined, {strategy: 'clone'});
    const text = encode({...value}) as string;
    expect(Object.keys(JSON.parse(text))).toEqual(['ok']);
    const out = createJsonDecoderFn<Wire>()(text) as Record<string, unknown>;
    expect(out).toEqual({ok: 1});
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });

  it('validate checks the surviving members only, so the type still works', () => {
    const isWire = createValidateFn<Wire>();
    expect(isWire({ok: 1})).toBe(true);
    expect(isWire({ok: 'nope'})).toBe(false);
  });

  it('the binary road round-trips the surviving members', () => {
    expect(createBinaryDecoderFn<Wire>()(createBinaryEncoderFn<Wire>()({...value}))).toEqual({ok: 1});
  });

  it('DataOnly drops the key too, so the type matches what the runtime does', () => {
    expectTypeOf<DataOnly<Wire>>().toEqualTypeOf<{ok: number}>();
  });
});

describe('a declared `prototype` or `constructor` member is ordinary', () => {
  interface Settings {
    ok: number;
    prototype: string;
    constructor: string;
  }
  interface Optionals {
    ok: number;
    prototype?: string;
    constructor?: string;
  }
  const settings: Settings = {ok: 1, prototype: 'draft', constructor: 'builder'};

  it('both members round-trip on both roads', () => {
    const text = createJsonEncoderFn<Settings>()({...settings}) as string;
    expect(createJsonDecoderFn<Settings>()(text)).toEqual(settings);
    expect(createBinaryDecoderFn<Settings>()(createBinaryEncoderFn<Settings>()({...settings}))).toEqual(settings);
    expect(createValidateFn<Settings>()(JSON.parse(text))).toBe(true);
  });

  it('a REQUIRED member is still required, so a value missing it fails', () => {
    // The trap: `({}).constructor` answers the inherited Object function, so a
    // plain `!== undefined` presence test would call the member present.
    const isSettings = createValidateFn<Settings>();
    expect(isSettings({ok: 1, prototype: 'draft'} as unknown as Settings)).toBe(false);
    expect(isSettings({ok: 1, constructor: 'builder'} as unknown as Settings)).toBe(false);
  });

  it('an ABSENT OPTIONAL member is absent, not the inherited Object function', () => {
    const isOptionals = createValidateFn<Optionals>();
    expect(isOptionals({ok: 1})).toBe(true);
    expect(isOptionals({ok: 1, constructor: 'builder'})).toBe(true);
    expect(isOptionals({ok: 1, constructor: 9} as unknown as Optionals)).toBe(false);
  });

  it('an encoder never writes the inherited value onto the wire', () => {
    // Each strategy is spelled at its own call site: the options object is a
    // build-time argument, so a loop variable would compile them all as default.
    const optionalEncoders = {
      clone: createJsonEncoderFn<Optionals>(undefined, {strategy: 'clone'}),
      mutate: createJsonEncoderFn<Optionals>(undefined, {strategy: 'mutate'}),
      direct: createJsonEncoderFn<Optionals>(undefined, {strategy: 'direct'}),
      compact: createJsonEncoderFn<Optionals>(undefined, {strategy: 'compact'}),
    };
    const decoders = {
      clone: createJsonDecoderFn<Optionals>(undefined, {strategy: 'preserve'}),
      mutate: createJsonDecoderFn<Optionals>(undefined, {strategy: 'preserve'}),
      direct: createJsonDecoderFn<Optionals>(undefined, {strategy: 'preserve'}),
      compact: createJsonDecoderFn<Optionals>(undefined, {strategy: 'compact'}),
    };
    // Checked by round trip, because `compact` writes a positional array where
    // an absent optional is a null placeholder rather than a missing key.
    for (const strategy of ['clone', 'mutate', 'direct', 'compact'] as const) {
      const text = optionalEncoders[strategy]({ok: 1}) as string;
      expect(text, strategy).not.toContain('function');
      expect(decoders[strategy](text), strategy).toEqual({ok: 1});
    }
    const decoded = createBinaryDecoderFn<Optionals>()(createBinaryEncoderFn<Optionals>()({ok: 1}));
    expect(Object.prototype.hasOwnProperty.call(decoded, 'constructor')).toBe(false);
  });

  it('DataOnly keeps both members', () => {
    expectTypeOf<DataOnly<Settings>>().toEqualTypeOf<Settings>();
  });
});

describe('the rebuilding encoders and the cloner skip a `__proto__` wire key; the in-place ones carry it to a wire the decoders refuse', () => {
  const poisoned = () => JSON.parse('{"a":1,"__proto__":{"admin":true}}') as Counts;
  // A Record whose values the in-place encoder must rewrite (a bigint has no
  // JSON form), so every strategy walks the keys.
  type Ledger = Record<string, bigint>;
  const poisonedLedger = () => {
    const value = JSON.parse('{"__proto__":{"admin":true}}') as Record<string, unknown>;
    value.a = 5n;
    return value as Ledger;
  };
  const ledgerEncoders = {
    clone: createJsonEncoderFn<Ledger>(undefined, {strategy: 'clone'}),
    mutate: createJsonEncoderFn<Ledger>(undefined, {strategy: 'mutate'}),
    direct: createJsonEncoderFn<Ledger>(undefined, {strategy: 'direct'}),
    compact: createJsonEncoderFn<Ledger>(undefined, {strategy: 'compact'}),
  };

  it('the rebuilding JSON encoders leave the key out of the wire', () => {
    // `clone` and `compact` write wire keys onto a fresh object, the one place
    // an own `__proto__` key would swap a prototype, so they carry the guard.
    for (const strategy of ['clone', 'compact'] as const) {
      const text = ledgerEncoders[strategy](poisonedLedger()) as string;
      expect(Object.keys(JSON.parse(text)), strategy).toEqual(['a']);
    }
  });

  it('the in-place JSON encoders carry the key through, and the decoders refuse that wire', () => {
    // `mutate` rewrites values on the object you passed and `direct` prints it:
    // neither writes a key onto another object, so neither pays a compare per
    // key. The receiving decoder is the guard.
    for (const strategy of ['mutate', 'direct'] as const) {
      const text = ledgerEncoders[strategy](poisonedLedger()) as string;
      expect(Object.keys(JSON.parse(text)), strategy).toContain('__proto__');
      expect(() => createJsonDecoderFn<Ledger>()(text), strategy).toThrow(message('__proto__'));
    }
  });

  it('the rebuilding encoders leave it out even when the values need no transform', () => {
    const countsEncoders = {
      clone: createJsonEncoderFn<Counts>(undefined, {strategy: 'clone'}),
      compact: createJsonEncoderFn<Counts>(undefined, {strategy: 'compact'}),
    };
    for (const strategy of ['clone', 'compact'] as const) {
      expect(Object.keys(JSON.parse(countsEncoders[strategy](poisoned()) as string)), strategy).toEqual(['a']);
    }
  });

  it('the binary encoder carries the key, and the binary decoder refuses the frame', () => {
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
  // prototype chain to read it, so all three names are ordinary data here on
  // both roads. A Record nested inside a Map value still refuses `__proto__`.
  const NAMES = ['__proto__', 'prototype', 'constructor'] as const;
  interface Bags {
    counts: Map<string, number>;
    names: Set<string>;
  }
  const value = (): Bags => ({
    counts: new Map(NAMES.map((key, i) => [key, i + 1] as [string, number])),
    names: new Set(NAMES),
  });

  it('round-trip through JSON with the three names as Map keys and Set members', () => {
    const bagEncoders = {
      clone: createJsonEncoderFn<Bags>(undefined, {strategy: 'clone'}),
      mutate: createJsonEncoderFn<Bags>(undefined, {strategy: 'mutate'}),
      direct: createJsonEncoderFn<Bags>(undefined, {strategy: 'direct'}),
    };
    const decode = createJsonDecoderFn<Bags>(undefined, {strategy: 'preserve'});
    for (const strategy of ['clone', 'mutate', 'direct'] as const) {
      const out = decode(bagEncoders[strategy](value()) as string);
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

  it('a Record inside a Map value still refuses `__proto__` and carries the other two', () => {
    type Nested = Map<string, Record<string, Date>>;
    const decode = createJsonDecoderFn<Nested>();
    expect(() => decode('[["k",{"__proto__":{"admin":true}}]]')).toThrow(message('__proto__'));
    expect(decode('[["k",{"constructor":"2024-01-01T00:00:00.000Z"}]]').get('k')?.constructor).toBeInstanceOf(Date);
  });
});

describe('class deserialization sets the declared properties only, never the keys on the wire', () => {
  it('an undeclared key on the body never lands on the instance, whatever the strategy', () => {
    const boxDecoders = {
      strip: createJsonDecoderFn<Box>(undefined, {strategy: 'strip'}),
      preserve: createJsonDecoderFn<Box>(undefined, {strategy: 'preserve'}),
    };
    for (const strategy of ['strip', 'preserve'] as const) {
      const out = boxDecoders[strategy]('{"value":4,"extra":9}') as Box & Record<string, unknown>;
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
    // A registered `serialize` writes one JSON string frame on the binary wire:
    // varint length, then the text.
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
  // reaches `prototype` through its constructor, and Error carries both. None of
  // that is a DECLARED member: were the scan ever to copy an inherited slot into
  // the type, these types would carry members their authors never wrote. So the
  // compiled functions must exist and behave, whatever the globals do.
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
