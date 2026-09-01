// Property fuzz for format transforms: "do it twice". mion's sanitize lane runs
// a route's compiled transform on the client AND on the server, so every rewrite
// a type can declare must give the same answer when applied to its own output.
// Over thousands of generated strings, transform(transform(x)) must equal
// transform(x) for trim, the case changes, replaceAll and stripSeparators,
// alone and chained, at any depth. The one deliberate exception, `replace`
// (first match only), is pinned the other way: the same inputs must PRODUCE a
// counterexample, which is what the docs warn about.
//
// Uses the real compiled fns (plugin-rewritten call sites), so it runs under the
// package config like the other fuzz integration specs, not the unit lane.

import {describe, it, expect} from 'vitest';
import type * as TF from '@mionjs/run-types/formats';
import '@mionjs/run-types/formats';
import {createFormatTransformFn} from '@mionjs/run-types';
import {withSeededRandom} from '../core/seededRng.ts';

type Nested = {
  email: TF.Transform<TF.Email, {trim: true; lowercase: true}>;
  tags: TF.Transform<string, {trim: true; uppercase: true}>[];
  card?: TF.CreditCard<{transform: {stripSeparators: true}}>;
  inner: {name: TF.Capitalize; codes: [TF.Lowercase, TF.String<{transform: {replaceAll: {searchValue: '-'; replaceValue: ''}}}>]};
};

const IDEMPOTENT = {
  trim: createFormatTransformFn<TF.String<{transform: {trim: true}}>>(),
  lowercase: createFormatTransformFn<TF.Lowercase>(),
  uppercase: createFormatTransformFn<TF.Uppercase>(),
  capitalize: createFormatTransformFn<TF.Capitalize>(),
  replaceAllDash: createFormatTransformFn<TF.String<{transform: {replaceAll: {searchValue: '-'; replaceValue: ''}}}>>(),
  replaceAllSpaceToUnderscore:
    createFormatTransformFn<TF.String<{transform: {replaceAll: {searchValue: ' '; replaceValue: '_'}}}>>(),
  trimLowercase: createFormatTransformFn<TF.Transform<TF.Email, {trim: true; lowercase: true}>>(),
  trimUppercaseCapitalize: createFormatTransformFn<TF.String<{transform: {trim: true; uppercase: true; capitalize: true}}>>(),
  stripSeparators: createFormatTransformFn<TF.CreditCard<{transform: {stripSeparators: true}}>>(),
  stripAndTrim: createFormatTransformFn<TF.Transform<TF.CreditCard, {trim: true; stripSeparators: true}>>(),
  ipv6: createFormatTransformFn<TF.IPv6<{transform: {lowercase: true}}>>(),
  url: createFormatTransformFn<TF.Url<{transform: {trim: true; lowercase: true}}>>(),
};
const replaceFirst = createFormatTransformFn<TF.String<{transform: {replace: {searchValue: 'a'; replaceValue: 'X'}}}>>();
const lowercaseCapitalize = createFormatTransformFn<TF.String<{transform: {lowercase: true; capitalize: true}}>>();
const nested = createFormatTransformFn<Nested>();

// Letters in both cases, digits, the separators the transforms act on, and the
// awkward Unicode: sharp s (upper-cases to TWO letters), dotted capital I, a
// combining mark, a surrogate pair. Whitespace of several kinds for trim.
// The non-breaking space is deliberate: `trim` removes it but `stripSeparators`
// and `replaceAll('-')` do not, which is how the fuzz caught trim running too early.
const ALPHABET = [...'abcxyzABCXYZ019 -_.@', 'ß', 'İ', 'é', 'e\u0301', '😀', '\t', '\n', '\u00A0', 'aa', 'a-a', ' a '];

function randomString(): string {
  const length = Math.floor(Math.random() * 25);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

function randomNested(): Nested {
  return {
    email: randomString() as Nested['email'],
    tags: Array.from({length: Math.floor(Math.random() * 4)}, randomString) as Nested['tags'],
    ...(Math.random() < 0.5 ? {card: randomString() as NonNullable<Nested['card']>} : {}),
    inner: {
      name: randomString() as TF.Capitalize,
      codes: [randomString() as TF.Lowercase, randomString()] as Nested['inner']['codes'],
    },
  };
}

const SEED = 0x7a5f;
const RUNS = 3000;

describe('fuzz / format transforms — applying a transform twice equals applying it once', () => {
  for (const [name, transform] of Object.entries(IDEMPOTENT)) {
    it(`${name} is idempotent over ${RUNS} generated strings`, () => {
      withSeededRandom(SEED, () => {
        for (let run = 0; run < RUNS; run++) {
          const input = randomString();
          const once = transform(input);
          expect(
            transform(once),
            `${name}: ${JSON.stringify(input)} [${[...input].map((c) => c.codePointAt(0)!.toString(16)).join(' ')}] -> ${JSON.stringify(once)}`
          ).toBe(once);
        }
      });
    });
  }

  it('a nested shape (object / array / tuple / optional) is idempotent as a whole', () => {
    withSeededRandom(SEED + 1, () => {
      for (let run = 0; run < 1000; run++) {
        const once = nested(randomNested());
        const snapshot = structuredClone(once);
        expect(nested(once)).toEqual(snapshot);
      }
    });
  });

  it('lowercase + capitalize is stable, except for a letter whose uppercase is two letters', () => {
    // 'ß'.toUpperCase() is 'SS', and there is no way back: 'ßy' -> 'SSy' -> 'ssy' -> 'Ssy'.
    // Documented as the one case-change chain that is not stable; everything else is.
    expect(lowercaseCapitalize('ßy')).toBe('SSy');
    expect(lowercaseCapitalize(lowercaseCapitalize('ßy'))).toBe('Ssy');
    withSeededRandom(SEED + 3, () => {
      for (let run = 0; run < RUNS; run++) {
        const input = randomString().replaceAll('ß', 'b');
        const once = lowercaseCapitalize(input);
        expect(lowercaseCapitalize(once), JSON.stringify(input)).toBe(once);
      }
    });
  });

  it('`replace` (first match only) is NOT idempotent, and the same inputs prove it', () => {
    let counterexamples = 0;
    withSeededRandom(SEED + 2, () => {
      for (let run = 0; run < RUNS; run++) {
        const input = randomString();
        const once = replaceFirst(input);
        if (replaceFirst(once) !== once) counterexamples++;
      }
    });
    // With 'a' in the alphabet, a string carrying two of them is common: the
    // oracle has teeth, which is the point of documenting `replace` as unsafe
    // for a value sanitized on both ends.
    expect(counterexamples).toBeGreaterThan(100);
  });
});
