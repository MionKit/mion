// A union carrying a Record member switches the unknown-key families OFF for the whole union: the value might match the
// record, where every key is declared, and no codec can tell which member it matched, so the stripping decoders stop
// stripping and `hasUnknownKeys` answers false. That breaks the two-step validate-then-pooled-key-check the router used
// to run: both halves say yes and an undeclared key reaches the handler. One probe per shape, the same rows through
// each, so a family that changes its answer names itself.

import {describe, expect, it} from 'vitest';
import {createHasUnknownKeysFn, createJsonDecoderFn, createJsonEncoderFn, createValidateFn} from '../../src/index.ts';

type ObjectOrNumbers = {a: string} | Record<string, number>;
type ObjectOrStrings = {a: string} | Record<string, string>;
type SamePropType = {a: number} | Record<string, number>;
type TwoProps = {a: string; b: number} | Record<string, number>;
type DiscriminatedOrNumbers = {kind: 'cat'; meows: boolean} | Record<string, number>;
type ObjectOrUnknowns = {a: string} | Record<string, unknown>;
type TwoObjects = {a: string} | {b: number};
type PlainObject = {a: string};

/** The four families asked about one type, built at a real call site so each marker resolves. */
interface Probe {
  decodeStrip: (wire: string) => unknown;
  validate: (value: unknown) => boolean;
  hasUnknownKeys: (value: unknown) => boolean;
  strict: (value: unknown) => boolean;
  unionKeys: (value: unknown) => boolean;
  encodeClone: (value: any) => unknown;
}

/** One value and the answer every family must give for it. */
interface Row {
  label: string;
  value: Record<string, unknown>;
  /** What the stripping decoder returns; equal to `value` when nothing was stripped. */
  decoded: Record<string, unknown>;
  validate: boolean;
  /** `validate && !hasUnknownKeys`, the two-step answer. */
  twoStep: boolean;
  /** `createValidateFn({checkUnknowns: true})`, the fused answer. */
  strict: boolean;
}

function checkRows(probe: Probe, rows: Row[]): void {
  for (const row of rows) {
    const decoded = probe.decodeStrip(JSON.stringify(row.value));
    expect(decoded, `${row.label} decoder {strategy: 'strip'}`).toEqual(row.decoded);
    expect(probe.validate(decoded), `${row.label} validate`).toBe(row.validate);
    const twoStep = probe.validate(decoded) && !probe.hasUnknownKeys(decoded);
    expect(twoStep, `${row.label} validate + hasUnknownKeys`).toBe(row.twoStep);
    expect(probe.strict(decoded), `${row.label} validate {checkUnknowns: true}`).toBe(row.strict);
    // The fused validator is never LOOSER than the two-step composition, on any shape.
    if (row.strict) expect(twoStep, `${row.label} strict accepts what the two-step rejects`).toBe(true);
    // checkUnionUnknowns sits between the two: never looser than validate, never stricter than checkUnknowns.
    const unionKeys = probe.unionKeys(decoded);
    if (unionKeys) expect(row.validate, `${row.label} union-keys accepts what validate rejects`).toBe(true);
    if (row.strict) expect(unionKeys, `${row.label} union-keys rejects what checkUnknowns accepts`).toBe(true);
  }
}

describe('a union with a Record member', () => {
  it('{a: string} | Record<string, number> — no decoder strips, only the fused validator refuses', () => {
    const probe: Probe = {
      decodeStrip: createJsonDecoderFn<ObjectOrNumbers>(undefined, {strategy: 'strip'}) as Probe['decodeStrip'],
      validate: createValidateFn<ObjectOrNumbers>() as Probe['validate'],
      hasUnknownKeys: createHasUnknownKeysFn<ObjectOrNumbers>() as Probe['hasUnknownKeys'],
      strict: createValidateFn<ObjectOrNumbers>(undefined, {checkUnknowns: true}) as Probe['strict'],
      unionKeys: createValidateFn<ObjectOrNumbers>(undefined, {checkUnionUnknowns: true}) as Probe['unionKeys'],
      encodeClone: createJsonEncoderFn<ObjectOrNumbers>(undefined, {strategy: 'clone'}) as Probe['encodeClone'],
    };
    checkRows(probe, [
      {label: 'clean object member', value: {a: 'x'}, decoded: {a: 'x'}, validate: true, twoStep: true, strict: true},
      // A string value no record member could hold, so the value matches NO member. The two-step answer takes it.
      {
        label: 'extra key the record cannot hold',
        value: {a: 'x', evil: 'garbage'},
        decoded: {a: 'x', evil: 'garbage'},
        validate: true,
        twoStep: true,
        strict: false,
      },
      // A number value the record COULD hold, but then `a` would have to be a number too.
      {
        label: 'extra key the record could hold',
        value: {a: 'x', evil: 1},
        decoded: {a: 'x', evil: 1},
        validate: true,
        twoStep: true,
        strict: false,
      },
      {label: 'clean record member', value: {p: 1, q: 2}, decoded: {p: 1, q: 2}, validate: true, twoStep: true, strict: true},
      {label: 'empty object', value: {}, decoded: {}, validate: true, twoStep: true, strict: true},
    ]);
    // The encoder keeps the key too, so a handler RETURNING this type writes every own property to the wire.
    expect(probe.encodeClone({a: 'public', passwordHash: 'SECRET'})).toBe('{"a":"public","passwordHash":"SECRET"}');
  });

  it('{a: string} | Record<string, string> — the record can hold the extra key, so keeping it is correct', () => {
    const probe: Probe = {
      decodeStrip: createJsonDecoderFn<ObjectOrStrings>(undefined, {strategy: 'strip'}) as Probe['decodeStrip'],
      validate: createValidateFn<ObjectOrStrings>() as Probe['validate'],
      hasUnknownKeys: createHasUnknownKeysFn<ObjectOrStrings>() as Probe['hasUnknownKeys'],
      strict: createValidateFn<ObjectOrStrings>(undefined, {checkUnknowns: true}) as Probe['strict'],
      unionKeys: createValidateFn<ObjectOrStrings>(undefined, {checkUnionUnknowns: true}) as Probe['unionKeys'],
      encodeClone: createJsonEncoderFn<ObjectOrStrings>(undefined, {strategy: 'clone'}) as Probe['encodeClone'],
    };
    checkRows(probe, [
      {label: 'clean object member', value: {a: 'x'}, decoded: {a: 'x'}, validate: true, twoStep: true, strict: true},
      // Genuinely a Record<string, string>, so every family is right to keep the key.
      {
        label: 'extra key the record holds',
        value: {a: 'x', evil: 'garbage'},
        decoded: {a: 'x', evil: 'garbage'},
        validate: true,
        twoStep: true,
        strict: true,
      },
      {
        label: 'extra key the record cannot hold',
        value: {a: 'x', evil: 1},
        decoded: {a: 'x', evil: 1},
        validate: true,
        twoStep: true,
        strict: false,
      },
      {
        label: 'numbers, matching no member',
        value: {p: 1, q: 2},
        decoded: {p: 1, q: 2},
        validate: false,
        twoStep: false,
        strict: false,
      },
      {label: 'empty object', value: {}, decoded: {}, validate: true, twoStep: true, strict: true},
    ]);
  });

  it('{a: number} | Record<string, number> — the object member is a record of one key', () => {
    const probe: Probe = {
      decodeStrip: createJsonDecoderFn<SamePropType>(undefined, {strategy: 'strip'}) as Probe['decodeStrip'],
      validate: createValidateFn<SamePropType>() as Probe['validate'],
      hasUnknownKeys: createHasUnknownKeysFn<SamePropType>() as Probe['hasUnknownKeys'],
      strict: createValidateFn<SamePropType>(undefined, {checkUnknowns: true}) as Probe['strict'],
      unionKeys: createValidateFn<SamePropType>(undefined, {checkUnionUnknowns: true}) as Probe['unionKeys'],
      encodeClone: createJsonEncoderFn<SamePropType>(undefined, {strategy: 'clone'}) as Probe['encodeClone'],
    };
    checkRows(probe, [
      {label: 'clean object member', value: {a: 1}, decoded: {a: 1}, validate: true, twoStep: true, strict: true},
      {label: 'extra number key', value: {a: 1, evil: 2}, decoded: {a: 1, evil: 2}, validate: true, twoStep: true, strict: true},
      {
        label: 'extra string key',
        value: {a: 1, evil: 's'},
        decoded: {a: 1, evil: 's'},
        validate: true,
        twoStep: true,
        strict: false,
      },
      {label: 'clean record member', value: {p: 1, q: 2}, decoded: {p: 1, q: 2}, validate: true, twoStep: true, strict: true},
      {label: 'empty object', value: {}, decoded: {}, validate: true, twoStep: true, strict: true},
    ]);
  });

  it('{a: string; b: number} | Record<string, number> — a partly record-shaped object member', () => {
    const probe: Probe = {
      decodeStrip: createJsonDecoderFn<TwoProps>(undefined, {strategy: 'strip'}) as Probe['decodeStrip'],
      validate: createValidateFn<TwoProps>() as Probe['validate'],
      hasUnknownKeys: createHasUnknownKeysFn<TwoProps>() as Probe['hasUnknownKeys'],
      strict: createValidateFn<TwoProps>(undefined, {checkUnknowns: true}) as Probe['strict'],
      unionKeys: createValidateFn<TwoProps>(undefined, {checkUnionUnknowns: true}) as Probe['unionKeys'],
      encodeClone: createJsonEncoderFn<TwoProps>(undefined, {strategy: 'clone'}) as Probe['encodeClone'],
    };
    checkRows(probe, [
      {label: 'clean object member', value: {a: 'x', b: 1}, decoded: {a: 'x', b: 1}, validate: true, twoStep: true, strict: true},
      {
        label: 'extra string key',
        value: {a: 'x', b: 1, evil: 'g'},
        decoded: {a: 'x', b: 1, evil: 'g'},
        validate: true,
        twoStep: true,
        strict: false,
      },
      {
        label: 'extra number key',
        value: {a: 'x', b: 1, evil: 2},
        decoded: {a: 'x', b: 1, evil: 2},
        validate: true,
        twoStep: true,
        strict: false,
      },
      {label: 'clean record member', value: {p: 1, q: 2}, decoded: {p: 1, q: 2}, validate: true, twoStep: true, strict: true},
      {label: 'empty object', value: {}, decoded: {}, validate: true, twoStep: true, strict: true},
    ]);
  });

  it('a discriminated member beside a record — the discriminant does not rescue the key check', () => {
    const probe: Probe = {
      decodeStrip: createJsonDecoderFn<DiscriminatedOrNumbers>(undefined, {strategy: 'strip'}) as Probe['decodeStrip'],
      validate: createValidateFn<DiscriminatedOrNumbers>() as Probe['validate'],
      hasUnknownKeys: createHasUnknownKeysFn<DiscriminatedOrNumbers>() as Probe['hasUnknownKeys'],
      strict: createValidateFn<DiscriminatedOrNumbers>(undefined, {checkUnknowns: true}) as Probe['strict'],
      unionKeys: createValidateFn<DiscriminatedOrNumbers>(undefined, {checkUnionUnknowns: true}) as Probe['unionKeys'],
      encodeClone: createJsonEncoderFn<DiscriminatedOrNumbers>(undefined, {strategy: 'clone'}) as Probe['encodeClone'],
    };
    checkRows(probe, [
      {
        label: 'clean discriminated member',
        value: {kind: 'cat', meows: true},
        decoded: {kind: 'cat', meows: true},
        validate: true,
        twoStep: true,
        strict: true,
      },
      {
        label: 'extra string key',
        value: {kind: 'cat', meows: true, evil: 'g'},
        decoded: {kind: 'cat', meows: true, evil: 'g'},
        validate: true,
        twoStep: true,
        strict: false,
      },
      {
        label: 'extra number key',
        value: {kind: 'cat', meows: true, evil: 2},
        decoded: {kind: 'cat', meows: true, evil: 2},
        validate: true,
        twoStep: true,
        strict: false,
      },
      {label: 'clean record member', value: {p: 1, q: 2}, decoded: {p: 1, q: 2}, validate: true, twoStep: true, strict: true},
      {label: 'empty object', value: {}, decoded: {}, validate: true, twoStep: true, strict: true},
    ]);
  });

  it('{a: string} | Record<string, unknown> — the record really does declare every key', () => {
    const probe: Probe = {
      decodeStrip: createJsonDecoderFn<ObjectOrUnknowns>(undefined, {strategy: 'strip'}) as Probe['decodeStrip'],
      validate: createValidateFn<ObjectOrUnknowns>() as Probe['validate'],
      hasUnknownKeys: createHasUnknownKeysFn<ObjectOrUnknowns>() as Probe['hasUnknownKeys'],
      strict: createValidateFn<ObjectOrUnknowns>(undefined, {checkUnknowns: true}) as Probe['strict'],
      unionKeys: createValidateFn<ObjectOrUnknowns>(undefined, {checkUnionUnknowns: true}) as Probe['unionKeys'],
      encodeClone: createJsonEncoderFn<ObjectOrUnknowns>(undefined, {strategy: 'clone'}) as Probe['encodeClone'],
    };
    // Every value is a valid record, so every family accepting everything is the right answer.
    checkRows(probe, [
      {label: 'clean object member', value: {a: 'x'}, decoded: {a: 'x'}, validate: true, twoStep: true, strict: true},
      {
        label: 'extra string key',
        value: {a: 'x', evil: 'garbage'},
        decoded: {a: 'x', evil: 'garbage'},
        validate: true,
        twoStep: true,
        strict: true,
      },
      {
        label: 'extra number key',
        value: {a: 'x', evil: 1},
        decoded: {a: 'x', evil: 1},
        validate: true,
        twoStep: true,
        strict: true,
      },
      {label: 'clean record member', value: {p: 1, q: 2}, decoded: {p: 1, q: 2}, validate: true, twoStep: true, strict: true},
      {label: 'empty object', value: {}, decoded: {}, validate: true, twoStep: true, strict: true},
    ]);
  });
});

describe('the same shapes without a Record member, where every family agrees', () => {
  it('{a: string} | {b: number} — the decoder strips and both checks refuse', () => {
    const probe: Probe = {
      decodeStrip: createJsonDecoderFn<TwoObjects>(undefined, {strategy: 'strip'}) as Probe['decodeStrip'],
      validate: createValidateFn<TwoObjects>() as Probe['validate'],
      hasUnknownKeys: createHasUnknownKeysFn<TwoObjects>() as Probe['hasUnknownKeys'],
      strict: createValidateFn<TwoObjects>(undefined, {checkUnknowns: true}) as Probe['strict'],
      unionKeys: createValidateFn<TwoObjects>(undefined, {checkUnionUnknowns: true}) as Probe['unionKeys'],
      encodeClone: createJsonEncoderFn<TwoObjects>(undefined, {strategy: 'clone'}) as Probe['encodeClone'],
    };
    checkRows(probe, [
      {label: 'clean object member', value: {a: 'x'}, decoded: {a: 'x'}, validate: true, twoStep: true, strict: true},
      {
        label: 'extra string key',
        value: {a: 'x', evil: 'garbage'},
        decoded: {a: 'x'},
        validate: true,
        twoStep: false,
        strict: false,
      },
      {label: 'extra number key', value: {a: 'x', evil: 1}, decoded: {a: 'x'}, validate: true, twoStep: false, strict: false},
      {label: 'matching no member', value: {p: 1, q: 2}, decoded: {}, validate: false, twoStep: false, strict: false},
      {label: 'empty object', value: {}, decoded: {}, validate: false, twoStep: false, strict: false},
    ]);
    expect(probe.encodeClone({a: 'public', passwordHash: 'SECRET'})).toBe('{"a":"public"}');
  });

  it('{a: string} — the plain object baseline', () => {
    const probe: Probe = {
      decodeStrip: createJsonDecoderFn<PlainObject>(undefined, {strategy: 'strip'}) as Probe['decodeStrip'],
      validate: createValidateFn<PlainObject>() as Probe['validate'],
      hasUnknownKeys: createHasUnknownKeysFn<PlainObject>() as Probe['hasUnknownKeys'],
      strict: createValidateFn<PlainObject>(undefined, {checkUnknowns: true}) as Probe['strict'],
      unionKeys: createValidateFn<PlainObject>(undefined, {checkUnionUnknowns: true}) as Probe['unionKeys'],
      encodeClone: createJsonEncoderFn<PlainObject>(undefined, {strategy: 'clone'}) as Probe['encodeClone'],
    };
    checkRows(probe, [
      {label: 'clean value', value: {a: 'x'}, decoded: {a: 'x'}, validate: true, twoStep: true, strict: true},
      {
        label: 'extra string key',
        value: {a: 'x', evil: 'garbage'},
        decoded: {a: 'x'},
        validate: true,
        twoStep: false,
        strict: false,
      },
      {label: 'extra number key', value: {a: 'x', evil: 1}, decoded: {a: 'x'}, validate: true, twoStep: false, strict: false},
      {label: 'wrong shape', value: {p: 1, q: 2}, decoded: {}, validate: false, twoStep: false, strict: false},
      {label: 'empty object', value: {}, decoded: {}, validate: false, twoStep: false, strict: false},
    ]);
    expect(probe.encodeClone({a: 'public', passwordHash: 'SECRET'})).toBe('{"a":"public"}');
  });
});
