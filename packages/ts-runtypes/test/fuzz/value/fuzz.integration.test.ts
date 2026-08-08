// End-to-end fuzz: drives REAL compiled validate/serialize functions through
// the oracle harness. Runs under the package vitest config (with the Vite
// plugin + Go binary), so the createX call sites below are rewritten with the
// resolved runtype id at compile time.
//
// IMPORTANT: the plugin resolves each createX call STATICALLY from the type of
// its argument, so every factory must be called against a concretely-typed
// `const schema` — never a generic `RunType` parameter (that would inject the
// `unknown` runtype). Hence the per-target inlining instead of a shared helper.

import * as TF from '@ts-runtypes/core/formats';
import {describe, it, expect} from 'vitest';
import * as RT from '@ts-runtypes/core/builders';
import {
  createMockDataFn,
  createValidateFn,
  createGetValidationErrorsFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
} from '@ts-runtypes/core';
import {runFuzz, runFuzzForDuration} from './fuzzRunner.ts';
import {laneSeed, soakSeed} from '../core/fuzzPolicy.ts';
import {soakTestTimeout, pathologyReport} from '../core/soakBudget.ts';
import type {FuzzTarget} from './fuzzOracle.ts';

const targets: FuzzTarget[] = [];

// --- target: flat object of primitives ---
{
  const schema = RT.object({id: TF.number(), name: TF.string(), active: RT.boolean()});
  targets.push({
    title: 'User',
    schema,
    mock: createMockDataFn(schema),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    jsonEncode: createJsonEncoderFn(schema),
    jsonDecode: createJsonDecoderFn(schema),
    binaryEncode: createBinaryEncoderFn(schema),
    binaryDecode: createBinaryDecoderFn(schema),
  });
}

// --- target: nested object with an array and a sub-object ---
{
  const schema = RT.object({tags: RT.array(TF.string()), meta: RT.object({count: TF.number()})});
  targets.push({
    title: 'Nested',
    schema,
    mock: createMockDataFn(schema),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    jsonEncode: createJsonEncoderFn(schema),
    jsonDecode: createJsonDecoderFn(schema),
    binaryEncode: createBinaryEncoderFn(schema),
    binaryDecode: createBinaryDecoderFn(schema),
  });
}

// --- target: tuple of mixed primitives ---
{
  const schema = RT.tuple([TF.string(), TF.number(), RT.boolean()]);
  targets.push({
    title: 'Tuple',
    schema,
    mock: createMockDataFn(schema),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    jsonEncode: createJsonEncoderFn(schema),
    jsonDecode: createJsonDecoderFn(schema),
    binaryEncode: createBinaryEncoderFn(schema),
    binaryDecode: createBinaryDecoderFn(schema),
  });
}

// --- target: optional + literal discriminant ---
{
  const schema = RT.object({kind: RT.literal('a'), value: TF.number(), note: RT.optional(TF.string())});
  targets.push({
    title: 'OptionalLiteral',
    schema,
    mock: createMockDataFn(schema),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    jsonEncode: createJsonEncoderFn(schema),
    jsonDecode: createJsonDecoderFn(schema),
    binaryEncode: createBinaryEncoderFn(schema),
    binaryDecode: createBinaryDecoderFn(schema),
  });
}

// --- target: Date + bigint (round-trip through the serializers) ---
{
  const schema = RT.object({created: TF.date(), id: TF.bigInt()});
  targets.push({
    title: 'DateBigint',
    schema,
    mock: createMockDataFn(schema),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    jsonEncode: createJsonEncoderFn(schema),
    jsonDecode: createJsonDecoderFn(schema),
    binaryEncode: createBinaryEncoderFn(schema),
    binaryDecode: createBinaryDecoderFn(schema),
  });
}

// --- target: union-typed field (walker must skip it; still corrupts siblings) ---
{
  const schema = RT.object({status: RT.union([RT.literal('on'), RT.literal('off')]), n: TF.number()});
  targets.push({
    title: 'UnionField',
    schema,
    mock: createMockDataFn(schema),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    jsonEncode: createJsonEncoderFn(schema),
    jsonDecode: createJsonDecoderFn(schema),
    binaryEncode: createBinaryEncoderFn(schema),
    binaryDecode: createBinaryDecoderFn(schema),
  });
}

describe('fuzz / integration — oracle sweep over compiled functions', () => {
  it('finds no oracle violations across all targets', () => {
    const report = runFuzz(targets, {seed: laneSeed('value', 0xc0ffee), iterations: 100});
    if (report.violations.length > 0) {
      const summary = report.violations
        .slice(0, 25)
        .map((v) => `  [${v.oracle}/${v.phase}] ${v.target} (seed=${v.seed}): ${v.message}\n      value=${v.value}`)
        .join('\n');
      throw new Error(
        `${report.violations.length} oracle violation(s) over ${report.runs} runs:\n${summary}` +
          (report.violations.length > 25 ? `\n  …and ${report.violations.length - 25} more` : '')
      );
    }
    expect(report.runs).toBe(targets.length * 100);
  });

  // Autonomous soak: opt-in via `RT_FUZZ_SOAK_MS=<ms>`. Runs continuously for the
  // given duration, logging every violation as it is found (the "run for some
  // time and log all errors" mode). Skipped in normal CI runs.
  const soakMs = Number(process.env.RT_FUZZ_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak — fuzz continuously and log all findings',
    () => {
      const report = runFuzzForDuration(targets, soakMs, {seed: soakSeed()}, (v) => {
        console.error(`[fuzz][${v.oracle}/${v.phase}] ${v.target} (seed=${v.seed}): ${v.message}\n    value=${v.value}`);
      });
      console.error(`[fuzz] soak finished: ${report.runs} runs, ${report.violations.length} violation(s)`);
      expect(pathologyReport(report.slowestIterationMs, report.slowestIterationRound)).toBeNull();
      expect(report.violations).toHaveLength(0);
    },
    soakTestTimeout(soakMs)
  );
});
