// Cuts or pads a drawn value to the length bounds, then replaces each char a char set rejects.
// Mirrors Go formats.GeneratorProblems, which only rejects a format that leaves the replacement nothing to use.

import type {StringParams} from '../../formats/string/stringFormats.ts';
import {MOCK_REPLACEMENT_CHARS} from '../../go-generated/builtinMockGenerators.generated.ts';
import {codePointLength, stringParamsAccept} from '../stringParamsAccept.ts';
import type {GeneratorContext} from './types.ts';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const VOWELS = 'aeiou';

interface FitContext extends Required<Pick<GeneratorContext, 'lo' | 'hi' | 'random'>> {
  /** True for a char the format's char sets accept. **/
  keepChar: (char: string) => boolean;
  /** Accepted chars a rejected one can become; empty when the char sets leave none. **/
  pool: readonly string[];
  /** Accepted chars padding adds, letters first. **/
  padPool: readonly string[];
}

export function fitContext(params: StringParams, ctx: Pick<GeneratorContext, 'lo' | 'hi' | 'random'>): FitContext {
  const charSets = {allowedChars: params.allowedChars, disallowedChars: params.disallowedChars};
  const keepChar = (char: string): boolean => stringParamsAccept(char, charSets, () => true);
  const allowed = params.allowedChars?.val;
  // Both cases of an allowed char, kept only when the set accepts them (`ignoreCase`).
  const source = allowed ? allowed + allowed.toUpperCase() + allowed.toLowerCase() : MOCK_REPLACEMENT_CHARS;
  const pool = [...new Set(source)].filter(keepChar);
  const letters = LETTERS.split('').filter(keepChar);
  const padPool = letters.length > 0 ? letters : pool.length > 0 ? pool : LETTERS.split('');
  return {lo: ctx.lo ?? 0, hi: ctx.hi ?? Infinity, random: ctx.random, keepChar, pool, padPool};
}

/** Candidates most natural first: the caller keeps the first the format accepts. **/
export function* fitCandidates(value: string, fit: FitContext, more: () => string): Generator<string> {
  if (codePointLength(value) < fit.lo) {
    if (/^\+?\d+$/.test(value)) yield padTo(value, fit, () => more().replace(/\D/g, ''), '');
    yield padTo(value, fit, more, ' ');
    yield padTo(value, fit, more, '');
  }
  const fitted = withLetters(value, fit);
  yield fitted;
  if (fit.pool.length > 0 && [...fitted].some((char) => !fit.keepChar(char))) yield replaceRejected(fitted, fit);
}

// An empty extra (a custom generator returning '') adds one pad letter instead, so padding always ends.
function padTo(value: string, fit: FitContext, extra: () => string, joiner: string): string {
  let current = value;
  let size = codePointLength(value);
  while (size < fit.lo) {
    const next = extra();
    const piece = next === '' ? pick(fit.padPool, fit) : (current === '' ? '' : joiner) + next;
    current += piece;
    size += codePointLength(piece);
  }
  return cut(current, fit.hi);
}

function withLetters(value: string, fit: FitContext): string {
  let padded = value;
  for (let size = codePointLength(value); size < fit.lo; size++) padded += pick(fit.padPool, fit);
  return cut(padded, fit.hi);
}

// A cut never ends on the space a word pad added.
function cut(value: string, hi: number): string {
  const chars = [...value];
  if (chars.length <= hi) return value;
  const kept = chars.slice(0, hi);
  if (kept[kept.length - 1] === ' ') kept[kept.length - 1] = 'a';
  return kept.join('');
}

function replaceRejected(value: string, fit: FitContext): string {
  let out = '';
  for (const char of value) out += fit.keepChar(char) ? char : replacement(char, fit);
  return out;
}

function replacement(char: string, fit: FitContext): string {
  const lower = char.toLowerCase();
  const upper = char.toUpperCase();
  // A one-char result only: `ß` upper-cases to `SS`, which would change the length.
  for (const other of [upper, lower]) if (other !== char && codePointLength(other) === 1 && fit.keepChar(other)) return other;
  if (lower !== upper) {
    const isVowel = VOWELS.includes(lower);
    const sameKind = fit.pool.filter((option) => /[a-z]/i.test(option) && VOWELS.includes(option.toLowerCase()) === isVowel);
    const sameCase = sameKind.filter((option) =>
      char === upper ? option === option.toUpperCase() : option === option.toLowerCase()
    );
    if (sameCase.length > 0) return pick(sameCase, fit);
    if (sameKind.length > 0) return pick(sameKind, fit);
  }
  return pick(fit.pool, fit);
}

function pick(options: readonly string[], fit: FitContext): string {
  return options[fit.random.int(0, options.length - 1)];
}
