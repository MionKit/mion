// Property fuzz for the mock generators, unit lane (pure TS, no Go binary). Every draw checks R1 a format the build
// check (Go formats.GeneratorProblems) passes never throws, R2 a Set-based reference independent of the validator's
// regexes, R3 stringParamsAccept, R4 only the named error throws, R5 one seed draws one value. Negative controls make
// each rule fire.

import {describe, it, expect} from 'vitest';
import {mixSeed, withSeededRandom} from '../core/seededRng.ts';
import {BUILTIN_SHAPES} from '../../../src/mocking/generators/builtins.ts';
import {reachableLengths} from '../../../src/mocking/generators/compose.ts';
import {MOCK_REPLACEMENT_CHARS} from '../../../src/go-generated/builtinMockGenerators.generated.ts';
import {mockFromGenerator} from '../../../src/mocking/generators/index.ts';
import {stringParamsAccept} from '../../../src/mocking/stringParamsAccept.ts';
import {MockRandom} from '../../../src/mocking/mockRandom.ts';
import type {StringParams} from '../../../src/formats/string/stringFormats.ts';

const RUNS = 3000;
type Name = keyof typeof BUILTIN_SHAPES;
const NAMES = Object.keys(BUILTIN_SHAPES) as Name[];
const upTo = (limit: number): number => Math.floor(Math.random() * limit);

// Natural lengths per generator, ascending.
const LENGTHS = Object.fromEntries(
  NAMES.map((name) => [
    name,
    [...new Set(BUILTIN_SHAPES[name].flatMap((shape) => reachableLengths(shape)))].sort((a, b) => a - b),
  ])
) as Record<Name, number[]>;

// Every char a built-in value holds, plus the ones padding adds.
const UNIVERSE = MOCK_REPLACEMENT_CHARS + '+-@._,';

interface Case {
  name: Name;
  params: StringParams;
  seed: number;
}

const someOf = (chars: string, keep: number): string => [...chars].filter(() => upTo(keep) !== 0).join('');

// Bounds near a natural edge or far outside, half the time with one side open; a char set half the time.
function randomCase(): Case {
  const name = NAMES[upTo(NAMES.length)];
  const lengths = LENGTHS[name];
  const shortest = lengths[0];
  const longest = lengths[lengths.length - 1];
  const near = (upTo(2) === 0 ? shortest : longest) + upTo(5) - 2;
  const edge = Math.max(0, [near, upTo(shortest), longest + 1 + upTo(40)][upTo(3)]);
  const params: StringParams = {};
  switch (upTo(4)) {
    case 0:
      params.length = edge;
      break;
    case 1:
      params.minLength = edge;
      break;
    case 2:
      params.maxLength = edge;
      break;
    default:
      params.minLength = Math.max(0, edge - upTo(4));
      params.maxLength = params.minLength + upTo(6);
  }
  const ignoreCase = upTo(4) === 0;
  switch (upTo(4)) {
    case 0:
      params.allowedChars = {val: someOf(UNIVERSE, 2) || 'x', ignoreCase};
      break;
    case 1:
      params.disallowedChars = {val: someOf(UNIVERSE, upTo(2) === 0 ? 8 : 1.05) || '~', ignoreCase, mockSamples: 'x'};
      break;
  }
  return {name, params, seed: upTo(2 ** 31)};
}

function lengthBounds(params: StringParams): [number, number] {
  if (params.length !== undefined) return [params.length, params.length];
  return [params.minLength ?? 0, params.maxLength ?? Infinity];
}

const inSet = (set: string, char: string, ignoreCase?: boolean): boolean =>
  ignoreCase ? set.toLowerCase().includes(char.toLowerCase()) : set.includes(char);

// Mirrors formats.GeneratorProblems for these params: true when the build would reject the format.
function buildRejects(params: StringParams): boolean {
  const [, hi] = lengthBounds(params);
  if (params.allowedChars && hi === 0) return true;
  const disallowed = params.disallowedChars;
  return (
    hi !== 0 && !!disallowed && [...MOCK_REPLACEMENT_CHARS].every((char) => inSet(disallowed.val, char, disallowed.ignoreCase))
  );
}

// R2, plain Set checks only.
function referenceViolation(value: string, params: StringParams): string | null {
  const [lo, hi] = lengthBounds(params);
  const size = [...value].length;
  if (size < lo || size > hi) return `length ${size} outside ${lo}..${hi}`;
  const {allowedChars, disallowedChars} = params;
  for (const char of value) {
    if (allowedChars && !inSet(allowedChars.val, char, allowedChars.ignoreCase)) return `char ${char} not allowed`;
    if (disallowedChars && inSet(disallowedChars.val, char, disallowedChars.ignoreCase)) return `char ${char} disallowed`;
  }
  return null;
}

const KNOWN_THROW = /values failed the format/;

type Draw = (testCase: Case) => string;
const realDraw: Draw = (testCase) => mockFromGenerator(testCase.name, testCase.params, new MockRandom(testCase.seed));

// `draw` is swapped only by the negative controls, to prove each rule fires.
function checkCase(testCase: Case, draw: Draw = realDraw): string | null {
  let value: string;
  try {
    value = draw(testCase);
  } catch (error) {
    const message = (error as Error).message;
    if (!KNOWN_THROW.test(message)) return `R4 unexpected throw: ${message}`;
    if (!buildRejects(testCase.params)) return `R1 threw on a format the build passes: ${message}`;
    return null;
  }
  const reference = referenceViolation(value, testCase.params);
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
    // R1: a throw on a format the build passes.
    expect(
      checkCase({...base, params: {allowedChars: {val: 'abc'}}}, () => {
        throw new Error('values failed the format');
      })
    ).toMatch(/^R1/);
    // R2: a length outside the bounds, a char the allowed set lacks, a disallowed char.
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
    // The real draw passes, and a format the build rejects may throw.
    expect(checkCase(base)).toBeNull();
    expect(checkCase({...base, params: {length: 0, allowedChars: {val: 'abc'}}})).toBeNull();
  });
});
