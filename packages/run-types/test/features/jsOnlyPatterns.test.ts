// Patterns using JS-only regex features (backreferences, lookarounds) compile, validate and keep their declared
// mockSamples: the build checks them with the same JS engine the emitted validator uses, not RE2.

import {describe, expect, it} from 'vitest';
import {createValidateFn, getRunType} from '@mionjs/run-types';
import type {String} from '@mionjs/run-types/formats';

type DoubledWord = String<{pattern: {source: '^(\\w+)-\\1$'; mockSamples: ['ab-ab', 'x-x']}}>;
// The sample generator cannot handle lookarounds, so these must declare their samples.
type PriceTag = String<{pattern: {source: '(?<=\\$)\\d+(?=\\.00$)'; mockSamples: ['$42.00', '$7.00']}}>;

function patternOf(rt: {formatAnnotation?: {params?: Record<string, any>}}) {
  const pattern = rt.formatAnnotation?.params?.pattern as {source: string; mockSamples?: readonly string[]} | undefined;
  if (!pattern) throw new Error('no pattern payload on the format annotation');
  return pattern;
}

describe('JS-only regex patterns', () => {
  it('validates a backreference pattern', () => {
    const isDoubled = createValidateFn<DoubledWord>();
    expect(isDoubled('ab-ab')).toBe(true);
    expect(isDoubled('ab-cd')).toBe(false);
  });

  it('validates a lookbehind + lookahead pattern', () => {
    const isPrice = createValidateFn<PriceTag>();
    expect(isPrice('$42.00')).toBe(true);
    expect(isPrice('42.00')).toBe(false);
  });

  it('keeps declared mockSamples verbatim instead of generating a pool', () => {
    expect(patternOf(getRunType<DoubledWord>()).mockSamples).toEqual(['ab-ab', 'x-x']);
    expect(patternOf(getRunType<PriceTag>()).mockSamples).toEqual(['$42.00', '$7.00']);
  });
});
