// A Record member turns the unknown-key codecs OFF for the whole union (any key may be the record's), so a
// validate-then-pooled-key-check lets an undeclared key reach the handler; the `strict` column closes it.
// This file pins the CODEC half; unionUnknownKeys.test.ts owns the validators.

import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createJsonEncoderFn, createValidateFn} from '../../src/index.ts';

type ObjectOrNumbers = {a: string} | Record<string, number>;
type ObjectOrStrings = {a: string} | Record<string, string>;
type TwoObjects = {a: string} | {b: number};
type PlainObject = {a: string};

/** The codec families asked about one type, built at a real call site so each marker resolves. */
interface Probe {
  decodeClone: (wire: string) => unknown;
  validate: (value: unknown) => boolean;
  strict: (value: unknown) => boolean;
  /** Keys declared by ANY member, or every key once a member is a record. */
  pooledKeys: readonly string[] | 'every key';
  encodeClone: (value: any) => unknown;
}

/** One value and the answer every family must give for it. */
interface Row {
  label: string;
  value: Record<string, unknown>;
  /** What the clone decoder returns; equal to `value` when nothing was stripped. */
  decoded: Record<string, unknown>;
  validate: boolean;
  /** `validate` and no key outside `pooledKeys`. */
  twoStep: boolean;
  /** Judges the matched member alone. */
  strict: boolean;
}

function outsidePool(probe: Probe, value: unknown): string[] {
  const {pooledKeys} = probe;
  if (pooledKeys === 'every key') return [];
  return Object.keys(value as object).filter((key) => !pooledKeys.includes(key));
}

function checkRows(probe: Probe, rows: Row[]): void {
  for (const row of rows) {
    const decoded = probe.decodeClone(JSON.stringify(row.value));
    expect(decoded, `${row.label} decoder {strategy: 'clone'}`).toEqual(row.decoded);
    expect(probe.validate(decoded), `${row.label} validate`).toBe(row.validate);
    const twoStep = probe.validate(decoded) && outsidePool(probe, decoded).length === 0;
    expect(twoStep, `${row.label} validate + pooled key check`).toBe(row.twoStep);
    expect(probe.strict(row.value), `${row.label} validate {checkUnknowns: true}`).toBe(row.strict);
  }
}

describe('a union with a Record member', () => {
  it('{a: string} | Record<string, number> — no decoder strips and the two-step check says yes', () => {
    const probe: Probe = {
      decodeClone: createJsonDecoderFn<ObjectOrNumbers>(undefined, {strategy: 'clone'}) as Probe['decodeClone'],
      validate: createValidateFn<ObjectOrNumbers>() as Probe['validate'],
      strict: createValidateFn<ObjectOrNumbers>(undefined, {checkUnknowns: true}) as Probe['strict'],
      pooledKeys: 'every key',
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
      decodeClone: createJsonDecoderFn<ObjectOrStrings>(undefined, {strategy: 'clone'}) as Probe['decodeClone'],
      validate: createValidateFn<ObjectOrStrings>() as Probe['validate'],
      strict: createValidateFn<ObjectOrStrings>(undefined, {checkUnknowns: true}) as Probe['strict'],
      pooledKeys: 'every key',
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
});

describe('the same shapes without a Record member, where the codecs do their job', () => {
  it('{a: string} | {b: number} — the decoder drops the key, so the two-step check sees a clean value', () => {
    const probe: Probe = {
      decodeClone: createJsonDecoderFn<TwoObjects>(undefined, {strategy: 'clone'}) as Probe['decodeClone'],
      validate: createValidateFn<TwoObjects>() as Probe['validate'],
      strict: createValidateFn<TwoObjects>(undefined, {checkUnknowns: true}) as Probe['strict'],
      pooledKeys: ['a', 'b'],
      encodeClone: createJsonEncoderFn<TwoObjects>(undefined, {strategy: 'clone'}) as Probe['encodeClone'],
    };
    checkRows(probe, [
      {label: 'clean object member', value: {a: 'x'}, decoded: {a: 'x'}, validate: true, twoStep: true, strict: true},
      {
        label: 'extra string key',
        value: {a: 'x', evil: 'garbage'},
        decoded: {a: 'x'},
        validate: true,
        twoStep: true,
        strict: false,
      },
      {label: 'extra number key', value: {a: 'x', evil: 1}, decoded: {a: 'x'}, validate: true, twoStep: true, strict: false},
      {label: 'matching no member', value: {p: 1, q: 2}, decoded: {}, validate: false, twoStep: false, strict: false},
      {label: 'empty object', value: {}, decoded: {}, validate: false, twoStep: false, strict: false},
    ]);
    expect(probe.encodeClone({a: 'public', passwordHash: 'SECRET'})).toBe('{"a":"public"}');
  });

  it('{a: string} — the plain object baseline', () => {
    const probe: Probe = {
      decodeClone: createJsonDecoderFn<PlainObject>(undefined, {strategy: 'clone'}) as Probe['decodeClone'],
      validate: createValidateFn<PlainObject>() as Probe['validate'],
      strict: createValidateFn<PlainObject>(undefined, {checkUnknowns: true}) as Probe['strict'],
      pooledKeys: ['a'],
      encodeClone: createJsonEncoderFn<PlainObject>(undefined, {strategy: 'clone'}) as Probe['encodeClone'],
    };
    checkRows(probe, [
      {label: 'clean value', value: {a: 'x'}, decoded: {a: 'x'}, validate: true, twoStep: true, strict: true},
      {
        label: 'extra string key',
        value: {a: 'x', evil: 'garbage'},
        decoded: {a: 'x'},
        validate: true,
        twoStep: true,
        strict: false,
      },
      {label: 'extra number key', value: {a: 'x', evil: 1}, decoded: {a: 'x'}, validate: true, twoStep: true, strict: false},
      {label: 'wrong shape', value: {p: 1, q: 2}, decoded: {}, validate: false, twoStep: false, strict: false},
      {label: 'empty object', value: {}, decoded: {}, validate: false, twoStep: false, strict: false},
    ]);
    expect(probe.encodeClone({a: 'public', passwordHash: 'SECRET'})).toBe('{"a":"public"}');
  });
});
