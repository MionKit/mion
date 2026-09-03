// The generated-code corpus scan, hand-written half: types whose names,
// literals, enum members and key patterns carry every character that could
// break an emitted string literal (quotes, backslashes, newlines, a Unicode
// line terminator, unicode, a leading digit, a space) plus a marker planted so
// that any text escaping its quotes is visible in the program text. Every
// family is compiled, every emitted body in this file's cache is run through
// the generated-code oracles, and the nasty values still round-trip on both
// roads. The secgen fuzz lane runs the same oracles over generated types.

import {describe, expect, it} from 'vitest';
import {
  createBinaryDecoderFn,
  createBinaryEncoderFn,
  createCloneExactShapeFn,
  createGetValidationErrorsFn,
  createHasUnknownKeysFn,
  createJsonDecoderFn,
  createJsonEncoderFn,
  createJsonSchemaFn,
  createMockDataFn,
  createParseFn,
  createValidateFn,
  getRTFnCaches,
} from '@mionjs/run-types';
import {entryCode} from '../../src/runtypes/rtUtils.ts';
import {
  checkGeneratedCode,
  renderGeneratedCodeViolations,
  INJECT_MARKER,
  type EmittedBody,
  type GeneratedCodeViolation,
} from '../fuzz/security/generatedCodeOracle.ts';

// A name shaped to close a single-quoted literal and run the marker.
type Escape = "'); rt_injected_marker(); ('";

enum Nasty {
  Quote = "it's",
  Backslash = 'back\\slash',
  Marker = "'); rt_injected_marker(); ('",
  Sep = 'ls sep',
}

interface Corpus {
  "it's": string;
  'say "hi"': number;
  'back\\slash': boolean;
  'line\nbreak': bigint;
  'ls sep': Date;
  'café 中': string[];
  '9lead': number;
  'has space': {nested: string};
  __proto__like: string;
  "'); rt_injected_marker(); ('": string;
  kind: Escape;
  tone: 'a\\b' | "c'd" | 'e"f' | 'g\nh';
  member: Nasty;
  tags: Set<string>;
  lookup: Map<string, number>;
  either: Date | bigint;
  optional?: 'x y';
}

interface Keyed {
  [k: `id-'${number}`]: {n: number};
}

// Every family, both call shapes covered elsewhere; here the STATIC shape over
// the corpus so each emitted body sits in this file's cache.
const validate = createValidateFn<Corpus>();
createGetValidationErrorsFn<Corpus>();
const encoders = {
  clone: createJsonEncoderFn<Corpus>(undefined, {strategy: 'clone'}),
  mutate: createJsonEncoderFn<Corpus>(undefined, {strategy: 'mutate'}),
  direct: createJsonEncoderFn<Corpus>(undefined, {strategy: 'direct'}),
  compact: createJsonEncoderFn<Corpus>(undefined, {strategy: 'compact'}),
};
const decoders = {
  strip: createJsonDecoderFn<Corpus>(undefined, {strategy: 'strip'}),
  preserve: createJsonDecoderFn<Corpus>(undefined, {strategy: 'preserve'}),
  compact: createJsonDecoderFn<Corpus>(undefined, {strategy: 'compact'}),
};
const toBinary = createBinaryEncoderFn<Corpus>();
const fromBinary = createBinaryDecoderFn<Corpus>();
const clone = createCloneExactShapeFn<Corpus>();
const parse = createParseFn<Corpus>();
createHasUnknownKeysFn<Corpus>();
createJsonSchemaFn<Corpus>();
createMockDataFn<Corpus>();
createValidateFn<Keyed>();
createJsonEncoderFn<Keyed>();
createJsonDecoderFn<Keyed>();
createBinaryEncoderFn<Keyed>();
createBinaryDecoderFn<Keyed>();

function emittedBodies(): EmittedBody[] {
  const out: EmittedBody[] = [];
  for (const [key, entry] of Object.entries(getRTFnCaches().rtFnsCache)) {
    const typed = entry as {familyTag?: string; isNoop?: boolean};
    if (typed.isNoop) continue;
    let code: string;
    try {
      code = entryCode(entry as never);
    } catch {
      continue; // an alwaysThrow entry has no body
    }
    if (!code) continue;
    out.push({key, family: typed.familyTag ?? '?', code});
  }
  return out;
}

const value = (): Corpus => ({
  "it's": 'a',
  'say "hi"': 1,
  'back\\slash': true,
  'line\nbreak': 5n,
  'ls sep': new Date('2024-01-01T00:00:00.000Z'),
  'café 中': ['x'],
  '9lead': 9,
  'has space': {nested: 'n'},
  __proto__like: 'p',
  "'); rt_injected_marker(); ('": 'm',
  kind: "'); rt_injected_marker(); ('",
  tone: "c'd",
  member: Nasty.Marker,
  tags: new Set(['t']),
  lookup: new Map([['k', 1]]),
  either: 7n,
});

describe('generated-code corpus scan (hand-written nasty corpus)', () => {
  it('compiles a body for every family over the corpus (guards the scan below)', () => {
    const bodies = emittedBodies();
    const families = new Set(bodies.map((b) => b.family));
    expect(bodies.length).toBeGreaterThan(20);
    for (const family of ['val', 'verr', 'pjs', 'sj', 'cj', 'jdST', 'jdPR', 'jdCO', 'tb', 'fb', 'ces']) {
      expect(families, `family ${family} must be in the corpus`).toContain(family);
    }
  });

  it('every emitted body passes every generated-code oracle', () => {
    const violations: GeneratedCodeViolation[] = [];
    for (const body of emittedBodies()) violations.push(...checkGeneratedCode(body, [INJECT_MARKER]));
    expect(violations, renderGeneratedCodeViolations(violations)).toEqual([]);
  });

  it('the nasty values validate and round-trip on both roads', () => {
    expect(validate(value())).toBe(true);
    for (const [name, encode] of Object.entries(encoders)) {
      const text = encode(structuredClone(value())) as string;
      const decode = name === 'compact' ? decoders.compact : decoders.strip;
      expect(decode(text), name).toEqual(value());
      if (name !== 'compact') expect(parse(JSON.parse(text))).toEqual(value());
    }
    expect(fromBinary(toBinary(value()))).toEqual(value());
    expect(clone(value())).toEqual(value());
  });

  it('the marker never runs: the emitted code holds it only inside string literals', () => {
    const bodies = emittedBodies();
    const holding = bodies.filter((b) => b.code.includes(INJECT_MARKER));
    expect(holding.length).toBeGreaterThan(0);
    expect((globalThis as Record<string, unknown>).rt_injected_marker).toBeUndefined();
  });
});
