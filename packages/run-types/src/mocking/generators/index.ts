// mockFromGenerator pads or cuts a drawn value to the length bounds, then keeps it only if the format's pattern and
// char rules accept it, so the mock always re-passes its own validator.

import type {CustomMockGenerators} from '../../formats/index.ts';
import type {BuiltinMockGenerators} from '../../go-generated/mockGeneratorMeta.generated.ts';
import type {StringParams} from '../../formats/string/stringFormats.ts';
import type {MockRandom} from '../mockRandom.ts';
import {codePointLength, stringParamsAccept} from '../stringParamsAccept.ts';
import {BUILTIN_GENERATORS} from './builtins.ts';
import type {GeneratorFn} from './types.ts';

export type {GeneratorContext, GeneratorFn} from './types.ts';

/** Draws before giving up on a format whose character rules keep rejecting the generated values. **/
const MAX_ATTEMPTS = 64;

const customGenerators = new Map<string, GeneratorFn>();

/** Declare the name on CustomMockGenerators first; a built-in or already registered name throws. **/
export function registerMockGenerator(customName: Extract<keyof CustomMockGenerators, string>, generator: GeneratorFn): void {
  const name: string = customName;
  if (isBuiltin(name)) throw new Error(`registerMockGenerator: \`${name}\` is a built-in generator; pick another name.`);
  if (customGenerators.has(name)) throw new Error(`registerMockGenerator: \`${name}\` is already registered.`);
  if (typeof generator !== 'function') throw new Error(`registerMockGenerator: \`${name}\` needs a function.`);
  customGenerators.set(name, generator);
}

export function mockFromGenerator(name: string, params: StringParams, random: MockRandom): string {
  const generator = isBuiltin(name) ? BUILTIN_GENERATORS[name] : customGenerators.get(name);
  if (!generator) {
    throw new Error(
      `Mock generator \`${name}\` is not registered; call registerMockGenerator('${name}', fn) before creating the mock.`
    );
  }
  const {lo, hi} = lengthBounds(params);
  const draw = (bounds: {lo?: number; hi?: number}): string => {
    const value = generator({random, ...bounds, params});
    if (typeof value !== 'string') throw new Error(`Mock generator \`${name}\` returned a ${typeof value}, not a string.`);
    return value;
  };
  const accepts = (value: string): boolean =>
    stringParamsAccept(value, params as Record<string, unknown>, (key) => {
      throw new Error(`Mock generator \`${name}\`: no run-time test for the string param '${key}'.`);
    });
  const charSets = {allowedChars: params.allowedChars, disallowedChars: params.disallowedChars};
  const keepChar = (char: string): boolean => stringParamsAccept(char, charSets, () => true);
  const bounds: Bounds = {lo: lo ?? 0, hi: hi ?? Infinity, random};
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    for (const candidate of fitToLength(draw({lo, hi}), bounds, () => draw({}), keepChar)) {
      if (accepts(candidate)) return candidate;
    }
  }
  throw new Error(
    `Mock generator \`${name}\`: ${MAX_ATTEMPTS} values failed the format's pattern, allowedChars or disallowedChars; ` +
      'relax them or drop the generator.'
  );
}

function isBuiltin(name: string): name is keyof BuiltinMockGenerators {
  return Object.prototype.hasOwnProperty.call(BUILTIN_GENERATORS, name);
}

function lengthBounds(params: StringParams): {lo?: number; hi?: number} {
  if (params.length !== undefined) return {lo: params.length, hi: params.length};
  return {lo: params.minLength, hi: params.maxLength};
}

const PAD_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** The value itself when it fits; else cut to `hi`, or padded to `lo` with more draws: digits after digits, then words
 *  joined by a space, then joined as is, then plain letters. Last, the value without the chars the format's char sets
 *  reject, fitted with letters. The caller keeps the first one the format accepts. **/
function* fitToLength(value: string, bounds: Bounds, more: () => string, keepChar: (char: string) => boolean): Generator<string> {
  const {lo, hi} = bounds;
  const size = codePointLength(value);
  if (size >= lo) {
    yield cut(value, hi);
    if (size <= hi) return;
  } else {
    if (/^\+?\d+$/.test(value)) yield padTo(value, bounds, () => more().replace(/\D/g, ''), '');
    yield padTo(value, bounds, more, ' ');
    yield padTo(value, bounds, more, '');
  }
  yield withLetters(value, bounds);
  yield withLetters([...value].filter(keepChar).join(''), bounds);
}

interface Bounds {
  lo: number;
  hi: number;
  random: MockRandom;
}

// An empty extra (a custom generator returning '') adds one letter instead, so padding always ends.
function padTo(value: string, {lo, hi, random}: Bounds, extra: () => string, joiner: string): string {
  let current = value;
  let size = codePointLength(value);
  while (size < lo) {
    const next = extra();
    const piece = next === '' ? random.string(1, PAD_LETTERS) : (current === '' ? '' : joiner) + next;
    current += piece;
    size += codePointLength(piece);
  }
  return cut(current, hi);
}

function withLetters(value: string, {lo, hi, random}: Bounds): string {
  const size = codePointLength(value);
  return cut(size < lo ? value + random.string(lo - size, PAD_LETTERS) : value, hi);
}

// A cut never ends on the space a word pad added: that last char becomes a letter.
function cut(value: string, hi: number): string {
  const chars = [...value];
  if (chars.length <= hi) return value;
  const kept = chars.slice(0, hi);
  if (kept[kept.length - 1] === ' ') kept[kept.length - 1] = 'a';
  return kept.join('');
}
