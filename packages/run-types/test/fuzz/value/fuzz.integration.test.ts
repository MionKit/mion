// End-to-end fuzz: drives REAL compiled validate/serialize functions through
// the oracle harness. Runs under the package vitest config (with the Vite
// plugin + Go binary), so the createX call sites below are rewritten with the
// resolved runtype id at compile time.
//
// IMPORTANT: the plugin resolves each createX call STATICALLY from the type of
// its argument, so every factory must be called against a concretely-typed
// `const schema` — never a generic `RunType` parameter (that would inject the
// `unknown` runtype). Hence the per-target inlining instead of a shared helper.

import * as TF from '@mionjs/run-types/formats';
import {describe, it, expect} from 'vitest';
import * as RT from '@mionjs/run-types/builders';
import {
  getRTFunction,
  type InjectTypeFnArgs,
  createMockDataFn,
  createValidateFn,
  createParseFn,
  createHasUnknownKeysFn,
  createGetValidationErrorsFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
} from '@mionjs/run-types';
import {runFuzz, runFuzzForDuration} from './fuzzRunner.ts';
import {entrySeed} from '../core/fuzzPolicy.ts';
import {soakTestTimeout, pathologyReport} from '../core/soakBudget.ts';
import {renderCrashes} from '../core/crashGuard.ts';
import type {FuzzTarget} from './fuzzOracle.ts';
import type {RunType} from '../../../src/runtypes/types.ts';

// restoreFromJson has no createX factory — it is reached by declaring its fnKey
// in a trailing InjectTypeFnArgs marker, the same wrapper shape a framework
// writes. Schema-first like every factory below, so the plugin resolves T from
// the concretely-typed `const schema` rather than injecting `unknown`.
//
// It is the reference half of O19: parse fuses this restore with validate, so
// the two together are what parse must agree with.
function recoverRestore<T>(_schema: RunType<T>, id?: InjectTypeFnArgs<T, 'rj'>) {
  return getRTFunction<'rj'>(id);
}

const targets: FuzzTarget[] = [];

// --- target: union of OBJECT members (discriminated) ---
// The corpus had only a union of string literals, so every union arm that
// differs between the strict families went unfuzzed. This is the shape where
// "which keys are declared?" stops having one answer, and where the strict
// error arm was found reporting nothing for values its validator rejected.
{
  const schema = RT.union([
    RT.object({kind: RT.literal('cat'), meows: RT.boolean()}),
    RT.object({kind: RT.literal('dog'), barks: TF.number()}),
  ]);
  targets.push({
    title: 'UnionOfObjects',
    schema,
    // The fused validator follows the branch that matched; the merged allowlist
    // cannot. O18 checks the half that must still hold. See fuzzOracle.ts.
    divergesFromComposition: true,
    mock: createMockDataFn(schema),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    validateStrict: createValidateFn(schema, {checkUnknowns: true}),
    errorsStrict: createGetValidationErrorsFn(schema, {checkUnknowns: true}),
    hasUnknownKeys: createHasUnknownKeysFn(schema, {runsAfterValidation: true}),
    parse: createParseFn(schema),
    restoreFromJson: recoverRestore(schema),
    jsonEncode: createJsonEncoderFn(schema),
    jsonDecode: createJsonDecoderFn(schema),
  });
}

// --- target: flat object of primitives ---
{
  const schema = RT.object({id: TF.number(), name: TF.string(), active: RT.boolean()});
  targets.push({
    title: 'User',
    schema,
    mock: createMockDataFn(schema),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    validateStrict: createValidateFn(schema, {checkUnknowns: true}),
    errorsStrict: createGetValidationErrorsFn(schema, {checkUnknowns: true}),
    hasUnknownKeys: createHasUnknownKeysFn(schema, {runsAfterValidation: true}),
    parse: createParseFn(schema),
    restoreFromJson: recoverRestore(schema),
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
    validateStrict: createValidateFn(schema, {checkUnknowns: true}),
    errorsStrict: createGetValidationErrorsFn(schema, {checkUnknowns: true}),
    hasUnknownKeys: createHasUnknownKeysFn(schema, {runsAfterValidation: true}),
    parse: createParseFn(schema),
    restoreFromJson: recoverRestore(schema),
    jsonEncode: createJsonEncoderFn(schema),
    jsonDecode: createJsonDecoderFn(schema),
    binaryEncode: createBinaryEncoderFn(schema),
    binaryDecode: createBinaryDecoderFn(schema),
  });
}

// --- target: tuple of mixed primitives ---
{
  const schema = RT.tuple({required: [TF.string(), TF.number(), RT.boolean()]});
  targets.push({
    title: 'Tuple',
    schema,
    mock: createMockDataFn(schema),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    validateStrict: createValidateFn(schema, {checkUnknowns: true}),
    errorsStrict: createGetValidationErrorsFn(schema, {checkUnknowns: true}),
    hasUnknownKeys: createHasUnknownKeysFn(schema, {runsAfterValidation: true}),
    parse: createParseFn(schema),
    restoreFromJson: recoverRestore(schema),
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
    validateStrict: createValidateFn(schema, {checkUnknowns: true}),
    errorsStrict: createGetValidationErrorsFn(schema, {checkUnknowns: true}),
    hasUnknownKeys: createHasUnknownKeysFn(schema, {runsAfterValidation: true}),
    parse: createParseFn(schema),
    restoreFromJson: recoverRestore(schema),
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
    validateStrict: createValidateFn(schema, {checkUnknowns: true}),
    errorsStrict: createGetValidationErrorsFn(schema, {checkUnknowns: true}),
    hasUnknownKeys: createHasUnknownKeysFn(schema, {runsAfterValidation: true}),
    parse: createParseFn(schema),
    restoreFromJson: recoverRestore(schema),
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
    validateStrict: createValidateFn(schema, {checkUnknowns: true}),
    errorsStrict: createGetValidationErrorsFn(schema, {checkUnknowns: true}),
    hasUnknownKeys: createHasUnknownKeysFn(schema, {runsAfterValidation: true}),
    parse: createParseFn(schema),
    restoreFromJson: recoverRestore(schema),
    jsonEncode: createJsonEncoderFn(schema),
    jsonDecode: createJsonDecoderFn(schema),
    binaryEncode: createBinaryEncoderFn(schema),
    binaryDecode: createBinaryDecoderFn(schema),
  });
}

// --- target: index signature ---
// Every key matching the index IS declared, so "unknown key" has no meaning
// here. The strict families must answer that the same way the standalone ones
// do, and nothing in the corpus reached an index signature before.
{
  const schema = RT.record(TF.number());
  targets.push({
    title: 'IndexSignature',
    schema,
    mock: createMockDataFn(schema),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    validateStrict: createValidateFn(schema, {checkUnknowns: true}),
    errorsStrict: createGetValidationErrorsFn(schema, {checkUnknowns: true}),
    hasUnknownKeys: createHasUnknownKeysFn(schema, {runsAfterValidation: true}),
    parse: createParseFn(schema),
    restoreFromJson: recoverRestore(schema),
    jsonEncode: createJsonEncoderFn(schema),
    jsonDecode: createJsonDecoderFn(schema),
  });
}

// --- target: an object holding a Map and a Set ---
// Map and Set hold entries, not properties, so the key check must not be
// spliced at those nodes while the object AROUND them still carries one.
{
  const schema = RT.object({
    lookup: RT.map(TF.string(), RT.object({score: TF.number()})),
    tags: RT.set(TF.string()),
  });
  targets.push({
    title: 'MapAndSet',
    schema,
    mock: createMockDataFn(schema),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    validateStrict: createValidateFn(schema, {checkUnknowns: true}),
    errorsStrict: createGetValidationErrorsFn(schema, {checkUnknowns: true}),
    hasUnknownKeys: createHasUnknownKeysFn(schema, {runsAfterValidation: true}),
  });
}

describe('fuzz / integration — oracle sweep over compiled functions', () => {
  it('finds no oracle violations across all targets', () => {
    const report = runFuzz(targets, {seed: entrySeed('value'), iterations: 100});
    if (report.violations.length > 0 || report.crashes.length > 0) {
      const summary = report.violations
        .slice(0, 25)
        .map((v) => `  [${v.oracle}/${v.phase}] ${v.target} (seed=${v.seed}): ${v.message}\n      value=${v.value}`)
        .join('\n');
      throw new Error(
        `${report.violations.length} oracle violation(s) + ${report.crashes.length} crash(es) over ${report.runs} runs:\n${summary}` +
          (report.violations.length > 25 ? `\n  …and ${report.violations.length - 25} more` : '') +
          (report.crashes.length > 0 ? `\n${renderCrashes(report.crashes)}` : '')
      );
    }
    expect(report.runs).toBe(targets.length * 100);
  });

  // O19's reference half is recovered through a marker wrapper, and
  // getRTFunction DEGRADES TO IDENTITY when a tuple does not resolve. An
  // identity restore would make the oracle compare parse against itself and pass
  // on everything, so the fuzz run above would go quietly vacuous. Pin that the
  // recovered fn really restores: the DateBigint target is the one whose leaves
  // change shape between the wire and the runtime value.
  it('O19 reference: the recovered restoreFromJson is the compiled one, not identity', () => {
    const schema = RT.object({created: TF.date(), id: TF.bigInt()});
    const restore = recoverRestore(schema);
    const restored = restore({created: '2020-01-02T03:04:05.000Z', id: '42'}) as {created: Date; id: bigint};
    expect(restored.created).toBeInstanceOf(Date);
    expect(typeof restored.id).toBe('bigint');
  });

  // Autonomous soak: opt-in via `MION_FUZZ_SOAK_MS=<ms>`. Runs continuously for the
  // given duration, logging every violation as it is found (the "run for some
  // time and log all errors" mode). Skipped in normal CI runs.
  const soakMs = Number(process.env.MION_FUZZ_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak — fuzz continuously and log all findings',
    () => {
      const report = runFuzzForDuration(targets, soakMs, {seed: entrySeed('value')}, (v) => {
        console.error(`[fuzz][${v.oracle}/${v.phase}] ${v.target} (seed=${v.seed}): ${v.message}\n    value=${v.value}`);
      });
      console.error(`[fuzz] soak finished: ${report.runs} runs, ${report.violations.length} violation(s)`);
      expect(pathologyReport(report.slowestIterationMs, report.slowestIterationRound)).toBeNull();
      if (report.crashes.length > 0) throw new Error(renderCrashes(report.crashes));
      expect(report.violations).toHaveLength(0);
    },
    soakTestTimeout(soakMs)
  );
});
