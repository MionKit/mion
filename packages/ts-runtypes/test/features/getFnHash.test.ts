// Acceptance test for `getFnHash` — derives the version-independent fnHash for a
// function family (+ its compile-time options) WITHOUT the plugin-injected
// function tuple. This is the surface a framework (mion) uses to rebuild the
// `<fnHash>_<typeId>` runtime cache key from a type's injected typeId alone,
// instead of hand-pinning a `family → prefix` map that used to churn every
// release.
//
// Two layers:
//  1. unit — every axis (validate options, JSON strategy, option-less) + errors.
//  2. cross-check — getFnHash(fnKey) MUST equal the fnHash the plugin actually
//     injects at a real InjectTypeFnArgs<T, Fn> call site. This is what proves
//     the Go-generated table agrees with the live binary. Per the CLAUDE.md
//     marker-coverage rule both call shapes are exercised (static grab<T>() and
//     reflection grab(value)), with one paired assertion that they agree.

import {describe, test, expect} from 'vitest';
import {
  getFnHash,
  type InjectTypeFnArgs,
  type CompTimeFnArgs,
  type ValidateOptions,
  type HasUnknownKeysCompileOptions,
} from '@ts-runtypes/core';
import {entryTupleKey, isEntryTuple, FN_HASH_LEN} from '../../src/runtypes/entryTuple.ts';

// Pull the injected fnHash (the 3-char prefix of the `<fnHash>_<typeId>` key) out
// of a raw InjectTypeFnArgs tuple. Throws if the plugin is inactive so a
// misconfigured run fails loudly instead of comparing against undefined.
function injectedHash(injected: unknown): string {
  if (!isEntryTuple(injected)) throw new Error('getFnHash test: plugin inactive — no injected tuple');
  return entryTupleKey(injected).slice(0, FN_HASH_LEN);
}

// Per-family wrappers returning the raw injected tuple. `_val?: T` exists only so
// the reflection call shape grab(value) can infer T from the value; it is never
// read. Mirrors the getRTFunctionRecovery wrapper shape.
function grabVal<T>(_val?: T, id?: InjectTypeFnArgs<T, 'val'>) {
  return id;
}
function grabValOpts<T>(_val?: T, _opts?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'val'>) {
  return id;
}
function grabVerr<T>(_val?: T, id?: InjectTypeFnArgs<T, 'verr'>) {
  return id;
}
function grabTb<T>(_val?: T, id?: InjectTypeFnArgs<T, 'tb'>) {
  return id;
}
function grabFb<T>(_val?: T, id?: InjectTypeFnArgs<T, 'fb'>) {
  return id;
}
function grabJsonEnc<T>(_val?: T, id?: InjectTypeFnArgs<T, 'jsonEncoder'>) {
  return id;
}
function grabJsonDec<T>(_val?: T, id?: InjectTypeFnArgs<T, 'jsonDecoder'>) {
  return id;
}
function grabPjs<T>(_val?: T, id?: InjectTypeFnArgs<T, 'pjs'>) {
  return id;
}
function grabHukOpts<T>(_val?: T, _opts?: CompTimeFnArgs<HasUnknownKeysCompileOptions>, id?: InjectTypeFnArgs<T, 'huk'>) {
  return id;
}

type Payload = {id: bigint; when: Date; name: string; tags: string[]};

describe('getFnHash — unit (resolves the version-independent fnHash per family + options)', () => {
  test('validate / validationErrors resolve their option variants', () => {
    // Plain form and every option subset resolve to distinct, stable hashes.
    expect(getFnHash('val')).toBe('nPZ');
    expect(getFnHash('val', {noLiterals: true})).toBe('N7J');
    expect(getFnHash('val', {noIsArrayCheck: true})).toBe('WeU');
    expect(getFnHash('val', {noLiterals: true, noIsArrayCheck: true})).toBe('GYK');
    // Option order is irrelevant (mirrors the Go declaration-order suffix).
    expect(getFnHash('val', {noIsArrayCheck: true, noLiterals: true})).toBe('GYK');
    expect(getFnHash('verr')).toBe('pBb');
    expect(getFnHash('verr', {noLiterals: true, noIsArrayCheck: true})).toBe('Yk4');
    // numberMode is an enum, not a boolean: its two non-default values ride as
    // distinct variant letters, and 'isFinite' (default) collapses to the plain.
    expect(getFnHash('val', {numberMode: 'isFinite'})).toBe('nPZ');
    expect(getFnHash('val', {numberMode: 'typeof'})).toBe('xLB');
    expect(getFnHash('val', {numberMode: 'notNaN'})).toBe('ycI');
    expect(getFnHash('verr', {numberMode: 'typeof'})).toBe('vhX');
    // numberMode composes with the boolean options (declaration-order suffix NLT).
    expect(getFnHash('val', {noLiterals: true, numberMode: 'typeof'})).toBe('hvr');
  });

  test('JSON encoder / decoder resolve their strategies (default when omitted)', () => {
    // Omitting the strategy yields the family default (clone / strip).
    expect(getFnHash('jsonEncoder')).toBe(getFnHash('jsonEncoder', {strategy: 'clone'}));
    expect(getFnHash('jsonEncoder', {strategy: 'clone'})).toBe('wUi');
    expect(getFnHash('jsonEncoder', {strategy: 'mutate'})).toBe('z1L');
    expect(getFnHash('jsonEncoder', {strategy: 'direct'})).toBe('y0u');
    expect(getFnHash('jsonEncoder', {strategy: 'compact'})).toBe('yeS');
    expect(getFnHash('jsonDecoder')).toBe(getFnHash('jsonDecoder', {strategy: 'strip'}));
    expect(getFnHash('jsonDecoder', {strategy: 'preserve'})).toBe('J5l');
    expect(getFnHash('jsonDecoder', {strategy: 'compact'})).toBe('MCy');
  });

  test('option-less families resolve to a single hash (options ignored)', () => {
    expect(getFnHash('tb')).toBe('plZ');
    expect(getFnHash('fb')).toBe('mY6');
    expect(getFnHash('ces')).toBe('wsq');
    // A family with no option axis ignores any options bag rather than throwing.
    expect(getFnHash('ces', {noLiterals: true})).toBe('wsq');
  });

  test('hasUnknownKeys resolves its runsAfterValidation variant', () => {
    expect(getFnHash('huk')).toBe('lRN');
    expect(getFnHash('huk', {runsAfterValidation: true})).toBe('Omg');
    // Foreign options don't select a huk variant.
    expect(getFnHash('huk', {noLiterals: true})).toBe('lRN');
  });

  test('throws on an unknown fnKey or a nonexistent variant', () => {
    expect(() => getFnHash('nope')).toThrow(/unknown fnKey/);
    expect(() => getFnHash('jsonEncoder', {strategy: 'bogus'})).toThrow(/no .* variant/);
  });
});

describe('getFnHash — matches the plugin-injected fnHash (table ⟷ live binary)', () => {
  // The keystone: the derived hash must be byte-identical to what the plugin
  // bakes into a real createX call site, or a consumer's rebuilt key would miss.
  test('default variant of each family equals its injected fnHash', () => {
    expect(getFnHash('val')).toBe(injectedHash(grabVal<Payload>()));
    expect(getFnHash('verr')).toBe(injectedHash(grabVerr<Payload>()));
    expect(getFnHash('tb')).toBe(injectedHash(grabTb<Payload>()));
    expect(getFnHash('fb')).toBe(injectedHash(grabFb<Payload>()));
    expect(getFnHash('jsonEncoder')).toBe(injectedHash(grabJsonEnc<Payload>()));
    expect(getFnHash('jsonDecoder')).toBe(injectedHash(grabJsonDec<Payload>()));
    expect(getFnHash('pjs')).toBe(injectedHash(grabPjs<Payload>()));
  });

  test('validate option variant equals its injected fnHash', () => {
    // The whole point of "options beyond the family": the plugin injects a
    // DIFFERENT hash for a noLiterals validator, and getFnHash tracks it.
    const injectedPlain = injectedHash(grabValOpts<Payload>());
    const injectedNoLiterals = injectedHash(grabValOpts<Payload>(undefined, {noLiterals: true}));
    expect(injectedNoLiterals).not.toBe(injectedPlain);
    expect(getFnHash('val')).toBe(injectedPlain);
    expect(getFnHash('val', {noLiterals: true})).toBe(injectedNoLiterals);
  });

  test('validate numberMode variant equals its injected fnHash', () => {
    // Proves the JS numberMode → variant-letter mapping (fnHash.ts) agrees with
    // what the live binary injects for each enum value.
    const injectedPlain = injectedHash(grabValOpts<Payload>());
    const injectedTypeof = injectedHash(grabValOpts<Payload>(undefined, {numberMode: 'typeof'}));
    const injectedNotNaN = injectedHash(grabValOpts<Payload>(undefined, {numberMode: 'notNaN'}));
    expect(injectedTypeof).not.toBe(injectedPlain);
    expect(injectedNotNaN).not.toBe(injectedPlain);
    expect(injectedNotNaN).not.toBe(injectedTypeof);
    expect(getFnHash('val', {numberMode: 'typeof'})).toBe(injectedTypeof);
    expect(getFnHash('val', {numberMode: 'notNaN'})).toBe(injectedNotNaN);
    // Explicit 'isFinite' is the default → collapses to the plain injected hash.
    expect(getFnHash('val', {numberMode: 'isFinite'})).toBe(injectedPlain);
  });

  test('hasUnknownKeys runsAfterValidation variant equals its injected fnHash', () => {
    // Same invariant as the validate options: the plugin injects a DIFFERENT
    // hash for the runsAfterValidation variant, and getFnHash tracks it.
    const injectedPlain = injectedHash(grabHukOpts<Payload>());
    const injectedRav = injectedHash(grabHukOpts<Payload>(undefined, {runsAfterValidation: true}));
    expect(injectedRav).not.toBe(injectedPlain);
    expect(getFnHash('huk')).toBe(injectedPlain);
    expect(getFnHash('huk', {runsAfterValidation: true})).toBe(injectedRav);
  });

  test('reflection call shape agrees with the static form (both marker shapes)', () => {
    // grab<T>() (static) vs grab(value) (T inferred) must inject the same hash,
    // and both must equal getFnHash(fnKey) — the runtime analog of the Go-side
    // form-equivalence check.
    const seed: Payload = {id: 7n, when: new Date('2021-05-06T07:08:09.000Z'), name: 'bob', tags: ['x']};
    const staticForm = injectedHash(grabVal<Payload>());
    const reflectionForm = injectedHash(grabVal(seed));
    expect(reflectionForm).toBe(staticForm);
    expect(getFnHash('val')).toBe(staticForm);
  });
});
