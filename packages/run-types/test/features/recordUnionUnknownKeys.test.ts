// A union carrying a Record member switches the unknown-key families OFF for the whole union: the value might match the
// record, where every key is declared, and no codec can tell which member it matched, so the stripping decoders stop
// stripping and `hasUnknownKeys` answers false. That breaks the two-step validate-then-pooled-key-check the router used
// to run: both halves say yes and an undeclared key reaches the handler. The validators that close it are the subject of
// unionUnknownKeys.test.ts; this file pins the CODEC half, the reason the hole exists at all.

import {describe, expect, it} from 'vitest';
import {createHasUnknownKeysFn, createJsonDecoderFn, createJsonEncoderFn, createValidateFn} from '../../src/index.ts';

type ObjectOrNumbers = {a: string} | Record<string, number>;
type ObjectOrStrings = {a: string} | Record<string, string>;
type TwoObjects = {a: string} | {b: number};
type PlainObject = {a: string};

/** The codec families asked about one type, built at a real call site so each marker resolves. */
interface Probe {
  decodeStrip: (wire: string) => unknown;
  validate: (value: unknown) => boolean;
  hasUnknownKeys: (value: unknown) => boolean;
  encodeClone: (value: any) => unknown;
}

/** One value and the answer every family must give for it. */
interface Row {
  label: string;
  value: Record<string, unknown>;
  /** What the stripping decoder returns; equal to `value` when nothing was stripped. */
  decoded: Record<string, unknown>;
  validate: boolean;
  /** `validate && !hasUnknownKeys`, the two-step answer the router used to run. */
  twoStep: boolean;
}

function checkRows(probe: Probe, rows: Row[]): void {
  for (const row of rows) {
    const decoded = probe.decodeStrip(JSON.stringify(row.value));
    expect(decoded, `${row.label} decoder {strategy: 'strip'}`).toEqual(row.decoded);
    expect(probe.validate(decoded), `${row.label} validate`).toBe(row.validate);
    const twoStep = probe.validate(decoded) && !probe.hasUnknownKeys(decoded);
    expect(twoStep, `${row.label} validate + hasUnknownKeys`).toBe(row.twoStep);
  }
}

describe('a union with a Record member', () => {
  it('{a: string} | Record<string, number> — no decoder strips and the two-step check says yes', () => {
    const probe: Probe = {
      decodeStrip: createJsonDecoderFn<ObjectOrNumbers>(undefined, {strategy: 'strip'}) as Probe['decodeStrip'],
      validate: createValidateFn<ObjectOrNumbers>() as Probe['validate'],
      hasUnknownKeys: createHasUnknownKeysFn<ObjectOrNumbers>() as Probe['hasUnknownKeys'],
      encodeClone: createJsonEncoderFn<ObjectOrNumbers>(undefined, {strategy: 'clone'}) as Probe['encodeClone'],
    };
    checkRows(probe, [
      {label: 'clean object member', value: {a: 'x'}, decoded: {a: 'x'}, validate: true, twoStep: true},
      // A string value no record member could hold, so the value matches NO member. The two-step answer takes it.
      {
        label: 'extra key the record cannot hold',
        value: {a: 'x', evil: 'garbage'},
        decoded: {a: 'x', evil: 'garbage'},
        validate: true,
        twoStep: true,
      },
      // A number value the record COULD hold, but then `a` would have to be a number too.
      {
        label: 'extra key the record could hold',
        value: {a: 'x', evil: 1},
        decoded: {a: 'x', evil: 1},
        validate: true,
        twoStep: true,
      },
      {label: 'clean record member', value: {p: 1, q: 2}, decoded: {p: 1, q: 2}, validate: true, twoStep: true},
      {label: 'empty object', value: {}, decoded: {}, validate: true, twoStep: true},
    ]);
    // The encoder keeps the key too, so a handler RETURNING this type writes every own property to the wire.
    expect(probe.encodeClone({a: 'public', passwordHash: 'SECRET'})).toBe('{"a":"public","passwordHash":"SECRET"}');
  });

  it('{a: string} | Record<string, string> — the record can hold the extra key, so keeping it is correct', () => {
    const probe: Probe = {
      decodeStrip: createJsonDecoderFn<ObjectOrStrings>(undefined, {strategy: 'strip'}) as Probe['decodeStrip'],
      validate: createValidateFn<ObjectOrStrings>() as Probe['validate'],
      hasUnknownKeys: createHasUnknownKeysFn<ObjectOrStrings>() as Probe['hasUnknownKeys'],
      encodeClone: createJsonEncoderFn<ObjectOrStrings>(undefined, {strategy: 'clone'}) as Probe['encodeClone'],
    };
    checkRows(probe, [
      {label: 'clean object member', value: {a: 'x'}, decoded: {a: 'x'}, validate: true, twoStep: true},
      // Genuinely a Record<string, string>, so every family is right to keep the key.
      {
        label: 'extra key the record holds',
        value: {a: 'x', evil: 'garbage'},
        decoded: {a: 'x', evil: 'garbage'},
        validate: true,
        twoStep: true,
      },
      {
        label: 'extra key the record cannot hold',
        value: {a: 'x', evil: 1},
        decoded: {a: 'x', evil: 1},
        validate: true,
        twoStep: true,
      },
      {label: 'numbers, matching no member', value: {p: 1, q: 2}, decoded: {p: 1, q: 2}, validate: false, twoStep: false},
      {label: 'empty object', value: {}, decoded: {}, validate: true, twoStep: true},
    ]);
  });
});

describe('the same shapes without a Record member, where the codecs do their job', () => {
  it('{a: string} | {b: number} — the decoder strips and the two-step check refuses', () => {
    const probe: Probe = {
      decodeStrip: createJsonDecoderFn<TwoObjects>(undefined, {strategy: 'strip'}) as Probe['decodeStrip'],
      validate: createValidateFn<TwoObjects>() as Probe['validate'],
      hasUnknownKeys: createHasUnknownKeysFn<TwoObjects>() as Probe['hasUnknownKeys'],
      encodeClone: createJsonEncoderFn<TwoObjects>(undefined, {strategy: 'clone'}) as Probe['encodeClone'],
    };
    checkRows(probe, [
      {label: 'clean object member', value: {a: 'x'}, decoded: {a: 'x'}, validate: true, twoStep: true},
      {label: 'extra string key', value: {a: 'x', evil: 'garbage'}, decoded: {a: 'x'}, validate: true, twoStep: false},
      {label: 'extra number key', value: {a: 'x', evil: 1}, decoded: {a: 'x'}, validate: true, twoStep: false},
      {label: 'matching no member', value: {p: 1, q: 2}, decoded: {}, validate: false, twoStep: false},
      {label: 'empty object', value: {}, decoded: {}, validate: false, twoStep: false},
    ]);
    expect(probe.encodeClone({a: 'public', passwordHash: 'SECRET'})).toBe('{"a":"public"}');
  });

  it('{a: string} — the plain object baseline', () => {
    const probe: Probe = {
      decodeStrip: createJsonDecoderFn<PlainObject>(undefined, {strategy: 'strip'}) as Probe['decodeStrip'],
      validate: createValidateFn<PlainObject>() as Probe['validate'],
      hasUnknownKeys: createHasUnknownKeysFn<PlainObject>() as Probe['hasUnknownKeys'],
      encodeClone: createJsonEncoderFn<PlainObject>(undefined, {strategy: 'clone'}) as Probe['encodeClone'],
    };
    checkRows(probe, [
      {label: 'clean value', value: {a: 'x'}, decoded: {a: 'x'}, validate: true, twoStep: true},
      {label: 'extra string key', value: {a: 'x', evil: 'garbage'}, decoded: {a: 'x'}, validate: true, twoStep: false},
      {label: 'extra number key', value: {a: 'x', evil: 1}, decoded: {a: 'x'}, validate: true, twoStep: false},
      {label: 'wrong shape', value: {p: 1, q: 2}, decoded: {}, validate: false, twoStep: false},
      {label: 'empty object', value: {}, decoded: {}, validate: false, twoStep: false},
    ]);
    expect(probe.encodeClone({a: 'public', passwordHash: 'SECRET'})).toBe('{"a":"public"}');
  });
});
