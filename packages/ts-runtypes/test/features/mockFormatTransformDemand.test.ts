// A createMockDataFn site must be able to apply declared format transforms
// WITHOUT a createFormatTransformFn call site in scope.
//
// The mock walker canonicalizes generated values through the compiled fmt
// (formatTransform) entry (mockType.ts lookupFormatTransform). fmt is
// demand-driven, and before this fix nothing demanded it for a mock-only file:
// mocks silently skipped declared case transforms (a Lowercase pool sample
// 'MiXeD' shipped as-is). Now a createMockDataFn-shaped site (its signature
// carries the CompTimeHints options bag) demands the fmt family alongside the
// runtype graph, riding the reflection facade's soft deps.
//
// This file must therefore contain NO createFormatTransformFn call — the
// entire point is that the mock site alone compiles the transform. The format
// params (maxLength: 33) are id-relevant, keeping this type's id distinct from
// other suites' Lowercase formats so no foreign call site can mask a
// regression.
//
// (Marker coverage rule: both getRunTypeId call shapes, with a convergence
// assert, on the same format type.)

import {describe, expect, it} from 'vitest';
import {createMockDataFn, createValidateFn, getRunTypeId} from '@mionjs/run-types';
// Side-effect import: registers the per-kind format mock fns (see
// createMockData.ts — an empty registry mocks formats as plain random values).
import '@mionjs/run-types/formats';
import type {Lowercase} from '@mionjs/run-types/formats';

type LoweredProbe = Lowercase<{maxLength: 33; mockSamples: ['MiXeDPROBE', 'UPPERPROBE', 'already']}>;

describe('mock applies format transforms without a createFormatTransformFn site', () => {
  it('lowercases pool samples drawn for a Lowercase format', () => {
    const isLowered = createValidateFn<LoweredProbe>();
    const mock = createMockDataFn<LoweredProbe>();
    for (let i = 0; i < 12; i++) {
      const value = mock() as string;
      expect(value).toBe(value.toLowerCase());
      expect(isLowered(value)).toBe(true);
    }
  });

  it('static and reflect getRunTypeId forms converge for the format', () => {
    const staticId = getRunTypeId<LoweredProbe>();
    const sample: LoweredProbe = 'already';
    expect(getRunTypeId(sample)).toBe(staticId);
  });
});
