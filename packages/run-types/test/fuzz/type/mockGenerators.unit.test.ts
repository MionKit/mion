// Property fuzz for the mock generators, unit lane (pure TS, no Go binary). Every draw checks R1 length bounds alone
// never throw (out of range is padded or cut), R2 a Set-based reference independent of the validator's regexes,
// R3 stringParamsAccept, R4 only the named error throws, R5 one seed draws one value. Negative controls make each fire.

import {describe, it, expect} from 'vitest';
import {mixSeed, withSeededRandom} from '../core/seededRng.ts';
import {mockGeneratorMeta, type MockGeneratorMeta} from '../../../src/go-generated/mockGeneratorMeta.generated.ts';
import {mockFromGenerator} from '../../../src/mocking/generators/index.ts';
import {stringParamsAccept} from '../../../src/mocking/stringParamsAccept.ts';
import {MockRandom} from '../../../src/mocking/mockRandom.ts';
import type {StringParams} from '../../../src/formats/string/stringFormats.ts';

const RUNS = 3000;
const NAMES = Object.keys(mockGeneratorMeta) as (keyof typeof mockGeneratorMeta)[];
const upTo = (limit: number): number => Math.floor(Math.random() * limit);

interface Case {
  name: keyof typeof mockGeneratorMeta;
  params: StringParams;
  seed: number;
}

// Bounds near a span edge, a quarter of the time far outside every span; half the time with one side open; a char
// set a third of the time.
function randomCase(): Case {
  const name = NAMES[upTo(NAMES.length)];
  const meta = mockGeneratorMeta[name];
  const [min, max] = meta.lengths[upTo(meta.lengths.length)];
  const far = upTo(4) === 0;
  const edge = far
    ? upTo(2) === 0
      ? upTo(min)
      : meta.lengths[meta.lengths.length - 1][1] + 1 + upTo(40)
    : (upTo(2) === 0 ? min : max) + upTo(5) - 2;
  const params: StringParams = {};
  switch (upTo(4)) {
    case 0:
      params.length = Math.max(0, edge);
      break;
    case 1:
      params.minLength = Math.max(0, edge);
      break;
    case 2:
      params.maxLength = Math.max(0, edge);
      break;
    default:
      params.minLength = Math.max(0, edge - upTo(4));
      params.maxLength = params.minLength + upTo(6);
  }
  const charSet = [...meta.chars].filter(() => upTo(4) !== 0).join('');
  if (upTo(3) === 0 && charSet) {
    if (upTo(2) === 0) params.allowedChars = {val: charSet};
    else
      params.disallowedChars = {val: [...meta.chars].filter((char) => !charSet.includes(char)).join('') || '~', mockSamples: 'x'};
  }
  return {name, params, seed: upTo(2 ** 31)};
}

function lengthBounds(params: StringParams): [number, number] {
  if (params.length !== undefined) return [params.length, params.length];
  return [params.minLength ?? 0, params.maxLength ?? Infinity];
}

// The chars a pad or a cut can add: a space between words, plain letters.
const PAD_CHARS = ' abcdefghijklmnopqrstuvwxyz';

// R2, built from the table and plain Set checks only. Mirrors formats.GeneratorProblems: required chars hold only at a
// natural length (a fitted value may be cut or lose the chars a char set rejects).
function referenceViolation(value: string, meta: MockGeneratorMeta, params: StringParams): string | null {
  const [lo, hi] = lengthBounds(params);
  const size = [...value].length;
  if (size < lo || size > hi) return `length ${size} outside ${lo}..${hi}`;
  const natural = meta.lengths.some(([min, max]) => max >= lo && min <= hi);
  const chars = natural ? meta.chars : meta.chars + PAD_CHARS;
  for (const char of value) if (!chars.includes(char)) return `char ${JSON.stringify(char)} not in the table`;
  if (natural)
    for (const char of meta.required) if (!value.includes(char)) return `required char ${JSON.stringify(char)} missing`;
  if (params.allowedChars)
    for (const char of value) if (!params.allowedChars.val.includes(char)) return `char ${char} not allowed`;
  if (params.disallowedChars)
    for (const char of value) if (params.disallowedChars.val.includes(char)) return `char ${char} disallowed`;
  return null;
}

const KNOWN_THROW = /values failed the format/;

type Draw = (testCase: Case) => string;
const realDraw: Draw = (testCase) => mockFromGenerator(testCase.name, testCase.params, new MockRandom(testCase.seed));

// `draw` is swapped only by the negative controls, to prove each rule fires.
function checkCase(testCase: Case, draw: Draw = realDraw): string | null {
  const meta = mockGeneratorMeta[testCase.name];
  const charsOnly = !testCase.params.allowedChars && !testCase.params.disallowedChars;
  let value: string;
  try {
    value = draw(testCase);
  } catch (error) {
    const message = (error as Error).message;
    if (!KNOWN_THROW.test(message)) return `R4 unexpected throw: ${message}`;
    if (charsOnly) return `R1 threw on length bounds alone: ${message}`;
    return null;
  }
  const reference = referenceViolation(value, meta, testCase.params);
  if (reference) return `R2 ${reference} in ${JSON.stringify(value)}`;
  if (!stringParamsAccept(value, testCase.params as Record<string, unknown>, () => true))
    return `R3 rejected ${JSON.stringify(value)}`;
  if (draw(testCase) !== value) return 'R5 the same seed drew another value';
  return null;
}

describe('mock generators: property fuzz', () => {
  it(`holds every rule over ${RUNS} random cases`, () => {
    for (let index = 0; index < RUNS; index++) {
      const iterSeed = mixSeed(0x6e7a10, 'mockGenerators', index);
      const testCase = withSeededRandom(iterSeed, randomCase);
      const violation = checkCase(testCase);
      if (violation) throw new Error(`${violation}\ncase ${JSON.stringify(testCase)} (replay withSeededRandom(${iterSeed}))`);
    }
  });

  it('negative control: each rule fires on a broken draw', () => {
    const base: Case = {name: 'lastName', params: {}, seed: 1};
    const fixed =
      (value: string): Draw =>
      () =>
        value;
    // R1: a throw on length bounds alone.
    expect(
      checkCase(base, () => {
        throw new Error('values failed the format');
      })
    ).toMatch(/^R1/);
    // R2: a char outside the table, a length outside the bounds, a char the allowed set lacks.
    expect(checkCase(base, fixed('Smith\u{1F4A9}'))).toMatch(/^R2 .*not in the table/);
    expect(checkCase({...base, name: 'fullName'}, fixed('Ann'))).toMatch(/^R2 required char " " missing/);
    expect(checkCase({...base, params: {maxLength: 1}}, fixed('S '))).toMatch(/^R2 length/);
    expect(checkCase({...base, params: {maxLength: 3}}, fixed('Smith'))).toMatch(/^R2 length/);
    expect(checkCase({...base, params: {allowedChars: {val: 'Smit'}}}, fixed('Smith'))).toMatch(/^R2 char h not allowed/);
    expect(checkCase({...base, params: {disallowedChars: {val: 'h', mockSamples: 'x'}}}, fixed('Smith'))).toMatch(
      /^R2 char h disallowed/
    );
    // R3: a value the reference accepts but the validator mirror rejects (a pattern the reference does not read).
    expect(checkCase({...base, params: {pattern: {source: '^Lee$'}}}, fixed('Smith'))).toMatch(/^R3/);
    // R4: any other throw.
    expect(
      checkCase(base, () => {
        throw new Error('boom');
      })
    ).toMatch(/^R4/);
    // R5: a draw that changes between two calls with one seed.
    let calls = 0;
    expect(checkCase(base, () => (calls++ === 0 ? 'Smith' : 'Lee'))).toMatch(/^R5/);
    expect(checkCase(base)).toBeNull();
  });
});
