/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it} from 'vitest';
import {getRunType, createValidateFn} from '@mionjs/run-types';
import {String} from '@mionjs/run-types/formats';

// Proves the mion pattern-checking sidecar actually runs through mion's plugin, and that
// the `patternSampleCount` passthrough reaches it.
//
// Until @ts-runtypes 0.12.0 pattern checks ran through RE2, so any pattern using a JS-only regex
// feature was UNCHECKABLE — mion carried an `allowUncheckedPatterns` option whose whole job was to
// suppress FMT004 and let such patterns ship unverified. 0.12.0 runs the checks on a real JS engine
// (the same `new RegExp` the emitted validator uses), so the escape hatch was removed upstream and
// mion dropped it. These tests are the evidence for that claim: if the sidecar were not running,
// the JS-only patterns below could not be compiled or sampled at all.
//
// mockSamples are also optional now — a pattern that declares none gets a pool generated from the
// regex at build time, `patternSampleCount` of them.

/** Must match `runTypes.patternSampleCount` in packages/devtools/vitest.config.ts. Duplicated
 *  rather than imported (that config is outside this package's tsconfig program): if the two
 *  drift, the pool-size test below fails, which is exactly the signal we want. */
const EXPECTED_SAMPLE_COUNT = 7;

// Backreference (`\1`) — RE2 cannot compile this at all. Samples declared, so no generation.
type DoubledWord = String<{pattern: {source: '^(\\w+)-\\1$'; mockSamples: ['ab-ab', 'x-x']}}>;

// Lookahead + lookbehind — also RE2-incompatible, and the sample generator explicitly cannot
// handle lookarounds (FMT005 names them as the usual case), so these MUST declare their samples.
type PriceTag = String<{pattern: {source: '(?<=\\$)\\d+(?=\\.00$)'; mockSamples: ['$42.00', '$7.00']}}>;

// No mockSamples: the build generates the pool. Kept generation-friendly on purpose — a plain
// bounded char-class the generator handles without retries.
type Sku = String<{pattern: {source: '^[a-z]{3}-[0-9]{2}$'}}>;

/** Reads the build-emitted pattern payload off the reflected format annotation — the same slot
 *  `mockStringParams` -> `patternSampleList` draws from at runtime, so this asserts the real path. */
function patternOf(rt: {formatAnnotation?: {params?: Record<string, any>}}) {
  const pattern = rt.formatAnnotation?.params?.pattern as
    | {source: string; flags?: string; mockSamples?: readonly string[]}
    | undefined;
  if (!pattern) throw new Error('no pattern payload on the format annotation');
  return pattern;
}

describe('mion pattern sidecar', () => {
  it('compiles and validates JS-only regex features RE2 cannot handle', () => {
    // A backreference: only a real JS engine can compile this, and it is the feature
    // allowUncheckedPatterns used to wave through unverified.
    const isDoubled = createValidateFn<DoubledWord>();
    expect(isDoubled('ab-ab')).toBe(true);
    expect(isDoubled('ab-cd')).toBe(false);

    // Lookbehind + lookahead.
    const isPrice = createValidateFn<PriceTag>();
    expect(isPrice('$42.00')).toBe(true);
    expect(isPrice('42.00')).toBe(false);
  });

  it('generates a mockSample pool for a pattern that declares none', () => {
    const pattern = patternOf(getRunType<Sku>());
    expect(pattern.mockSamples).toBeDefined();
    expect(pattern.mockSamples!.length).toBeGreaterThan(0);

    // Every generated sample must satisfy the pattern it was generated from — that is the
    // sidecar validating its own output, not just emitting strings.
    const re = new RegExp(pattern.source, pattern.flags);
    for (const sample of pattern.mockSamples!) expect(sample).toMatch(re);
  });

  it('honours patternSampleCount from the mion plugin options', () => {
    // The assertion that fails if the passthrough is mis-wired: the pool size is the option's
    // only observable effect.
    expect(patternOf(getRunType<Sku>()).mockSamples).toHaveLength(EXPECTED_SAMPLE_COUNT);
  });

  it('keeps declared mockSamples instead of generating over them', () => {
    // Declared samples always win — the pool is the author's list verbatim, not a generated
    // one of EXPECTED_SAMPLE_COUNT entries.
    expect(patternOf(getRunType<DoubledWord>()).mockSamples).toEqual(['ab-ab', 'x-x']);
    expect(patternOf(getRunType<PriceTag>()).mockSamples).toEqual(['$42.00', '$7.00']);
  });
});
