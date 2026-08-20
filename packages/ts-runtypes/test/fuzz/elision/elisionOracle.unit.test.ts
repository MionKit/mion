// Negative controls for the elision lane's oracles (the iron rule: a red lane
// must mean a real bug, so every oracle is proven to FIRE on a deliberately
// broken output) plus the generator's replay determinism. Binary-free — runs
// in the unit lane.

import {describe, expect, it} from 'vitest';
import {withSeededRandom} from '../core/seededRng.ts';
import {randomShape, renderBuilderExpr, validValue, DEFAULT_BUILDER_GEN_OPTIONS} from './builderGen.ts';
import {
  checkSharedEntriesIdentical,
  checkStaticHasNoReflection,
  checkValueHasReflection,
  RUNTYPES_BUNDLE_BASENAME,
} from './elisionOracle.ts';

describe('elision oracles fire on broken output (negative controls)', () => {
  it('E1 fires on a missing shared module', () => {
    const violation = checkSharedEntriesIdentical(1, 't', {abc_X: 'code'}, {});
    expect(violation?.oracle).toBe('E1-entry-drift');
  });

  it('E1 fires on a single-byte drift in a shared module', () => {
    const violation = checkSharedEntriesIdentical(1, 't', {abc_X: 'code'}, {abc_X: 'codf'});
    expect(violation?.oracle).toBe('E1-entry-drift');
  });

  it('E1 stays quiet when every static module matches', () => {
    expect(checkSharedEntriesIdentical(1, 't', {abc_X: 'code'}, {abc_X: 'code', extra: 'reflection'})).toBeUndefined();
  });

  it('E2 fires when the static form carries the runtypes bundle', () => {
    const violation = checkStaticHasNoReflection(1, 't', {modules: {[RUNTYPES_BUNDLE_BASENAME]: 'x'}, siteFnIds: ['abc']});
    expect(violation?.oracle).toBe('E2-static-reflection');
  });

  it('E2 fires when the static form kept a reflection site', () => {
    const violation = checkStaticHasNoReflection(1, 't', {modules: {}, siteFnIds: ['abc', '']});
    expect(violation?.oracle).toBe('E2-static-reflection');
  });

  it('E2 fires when the value form lost its reflection payload', () => {
    const violation = checkValueHasReflection(1, 't', {modules: {abc_X: 'code'}, siteFnIds: ['abc']});
    expect(violation?.oracle).toBe('E2-value-missing-reflection');
  });

  it('E2 stays quiet on a well-formed pair', () => {
    expect(checkStaticHasNoReflection(1, 't', {modules: {abc_X: 'c'}, siteFnIds: ['abc']})).toBeUndefined();
    expect(
      checkValueHasReflection(1, 't', {modules: {abc_X: 'c', [RUNTYPES_BUNDLE_BASENAME]: 'b'}, siteFnIds: ['abc', '']})
    ).toBeUndefined();
  });
});

describe('builder generator determinism (replayability)', () => {
  it('the same seed reproduces the same schema and probe value', () => {
    const runOnce = (): string =>
      withSeededRandom(1234, () => {
        const shape = randomShape(DEFAULT_BUILDER_GEN_OPTIONS);
        return renderBuilderExpr(shape) + '|' + JSON.stringify(validValue(shape));
      });
    expect(runOnce()).toBe(runOnce());
  });
});
