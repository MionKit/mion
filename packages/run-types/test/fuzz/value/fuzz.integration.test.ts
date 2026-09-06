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
  createUnknownKeyErrorsFn,
  createCloneExactShapeFn,
  createGetValidationErrorsFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  registerClassSerializer,
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
    hasUnknownKeysBlind: createHasUnknownKeysFn(schema),
    unknownKeyErrors: createUnknownKeyErrorsFn(schema),
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
    hasUnknownKeysBlind: createHasUnknownKeysFn(schema),
    unknownKeyErrors: createUnknownKeyErrorsFn(schema),
    clone: createCloneExactShapeFn(schema),
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
    hasUnknownKeysBlind: createHasUnknownKeysFn(schema),
    unknownKeyErrors: createUnknownKeyErrorsFn(schema),
    clone: createCloneExactShapeFn(schema),
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
    hasUnknownKeysBlind: createHasUnknownKeysFn(schema),
    unknownKeyErrors: createUnknownKeyErrorsFn(schema),
    clone: createCloneExactShapeFn(schema),
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
    hasUnknownKeysBlind: createHasUnknownKeysFn(schema),
    unknownKeyErrors: createUnknownKeyErrorsFn(schema),
    clone: createCloneExactShapeFn(schema),
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
    hasUnknownKeysBlind: createHasUnknownKeysFn(schema),
    unknownKeyErrors: createUnknownKeyErrorsFn(schema),
    clone: createCloneExactShapeFn(schema),
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
    hasUnknownKeysBlind: createHasUnknownKeysFn(schema),
    unknownKeyErrors: createUnknownKeyErrorsFn(schema),
    clone: createCloneExactShapeFn(schema),
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
    hasUnknownKeysBlind: createHasUnknownKeysFn(schema),
    unknownKeyErrors: createUnknownKeyErrorsFn(schema),
    clone: createCloneExactShapeFn(schema),
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
    hasUnknownKeysBlind: createHasUnknownKeysFn(schema),
    unknownKeyErrors: createUnknownKeyErrorsFn(schema),
    clone: createCloneExactShapeFn(schema),
  });
}

// --- targets: a named class inside a union ---
// The shape that drifted last, and the one no generator reaches on its own: a
// class member rides its own wire arm, so the merged-object strip and the
// merged allowlist each have to be taught about it separately. Registered and
// unregistered are different code paths (the class arm is skipped when the
// registry has no entry), and a SUBCLASS instance takes the structural road
// rather than the exact-constructor one.
class BaseErr {
  constructor(public type: string) {}
}
class AuthErr extends BaseErr {
  constructor(
    type: string,
    public scope: string
  ) {
    super(type);
  }
}
class Loose {
  constructor(public tag: string) {}
}
registerClassSerializer(BaseErr, {deserialize: (d) => new BaseErr(d.type)});
registerClassSerializer(AuthErr, {deserialize: (d) => new AuthErr(d.type, d.scope)});
// Loose is deliberately NOT registered.

{
  const schema = RT.union([TF.string(), RT.classType(BaseErr)]);
  targets.push({
    title: 'ClassUnionRegistered',
    schema,
    divergesFromComposition: true,
    mock: () => new BaseErr('boom'),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    validateStrict: createValidateFn(schema, {checkUnknowns: true}),
    errorsStrict: createGetValidationErrorsFn(schema, {checkUnknowns: true}),
    hasUnknownKeys: createHasUnknownKeysFn(schema, {runsAfterValidation: true}),
    hasUnknownKeysBlind: createHasUnknownKeysFn(schema),
    unknownKeyErrors: createUnknownKeyErrorsFn(schema),
    jsonEncode: createJsonEncoderFn(schema),
    jsonDecode: createJsonDecoderFn(schema),
  });
}

{
  const schema = RT.union([TF.string(), RT.classType(Loose)]);
  targets.push({
    title: 'ClassUnionUnregistered',
    schema,
    divergesFromComposition: true,
    mock: () => new Loose('t'),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    validateStrict: createValidateFn(schema, {checkUnknowns: true}),
    errorsStrict: createGetValidationErrorsFn(schema, {checkUnknowns: true}),
    hasUnknownKeys: createHasUnknownKeysFn(schema, {runsAfterValidation: true}),
    hasUnknownKeysBlind: createHasUnknownKeysFn(schema),
    unknownKeyErrors: createUnknownKeyErrorsFn(schema),
    jsonEncode: createJsonEncoderFn(schema),
    jsonDecode: createJsonDecoderFn(schema),
  });
}

{
  const schema = RT.union([TF.string(), RT.classType(BaseErr)]);
  targets.push({
    title: 'ClassUnionSubclassInstance',
    schema,
    divergesFromComposition: true,
    // a subclass instance under its declared base: the exact-constructor arm
    // does not match, so it takes the structural road and its extra field is
    // the unknown-keys machinery's business
    mock: () => new AuthErr('not-authorized', 'admin'),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    validateStrict: createValidateFn(schema, {checkUnknowns: true}),
    errorsStrict: createGetValidationErrorsFn(schema, {checkUnknowns: true}),
    hasUnknownKeys: createHasUnknownKeysFn(schema, {runsAfterValidation: true}),
    hasUnknownKeysBlind: createHasUnknownKeysFn(schema),
    unknownKeyErrors: createUnknownKeyErrorsFn(schema),
  });
}

// --- target: a nested class, not in a union ---
// The other half of the class comparison: the same class reached as a plain
// property must answer the way the union member above does.
{
  const schema = RT.object({err: RT.classType(BaseErr), note: TF.string()});
  targets.push({
    title: 'ClassProperty',
    schema,
    mock: () => ({err: new BaseErr('boom'), note: 'n'}),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    validateStrict: createValidateFn(schema, {checkUnknowns: true}),
    errorsStrict: createGetValidationErrorsFn(schema, {checkUnknowns: true}),
    hasUnknownKeys: createHasUnknownKeysFn(schema, {runsAfterValidation: true}),
    hasUnknownKeysBlind: createHasUnknownKeysFn(schema),
    unknownKeyErrors: createUnknownKeyErrorsFn(schema),
    clone: createCloneExactShapeFn(schema),
    jsonEncode: createJsonEncoderFn(schema),
    jsonDecode: createJsonDecoderFn(schema),
  });
}

// --- target: objects at every container position ---
// An array item, a fixed tuple slot and a Set member each have their own arm
// in every unknown-keys emitter, and nothing in the corpus put a keyed shape
// in one before.
{
  const schema = RT.object({
    rows: RT.array(RT.object({n: TF.number()})),
    pair: RT.tuple({required: [RT.object({a: TF.string()}), TF.number()]}),
    seen: RT.set(RT.object({id: TF.string()})),
  });
  targets.push({
    title: 'ObjectsInContainers',
    schema,
    mock: createMockDataFn(schema),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    validateStrict: createValidateFn(schema, {checkUnknowns: true}),
    errorsStrict: createGetValidationErrorsFn(schema, {checkUnknowns: true}),
    hasUnknownKeys: createHasUnknownKeysFn(schema, {runsAfterValidation: true}),
    hasUnknownKeysBlind: createHasUnknownKeysFn(schema),
    unknownKeyErrors: createUnknownKeyErrorsFn(schema),
    clone: createCloneExactShapeFn(schema),
  });
}

// --- target: an index signature next to named properties ---
// The carve-out with siblings: the named half still takes the key check, the
// indexed half must not, and every family has to draw that line in the same
// place.
{
  const schema = RT.object({name: TF.string(), bag: RT.record(TF.number())});
  targets.push({
    title: 'IndexSigWithNamedProps',
    schema,
    mock: createMockDataFn(schema),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    validateStrict: createValidateFn(schema, {checkUnknowns: true}),
    errorsStrict: createGetValidationErrorsFn(schema, {checkUnknowns: true}),
    hasUnknownKeys: createHasUnknownKeysFn(schema, {runsAfterValidation: true}),
    hasUnknownKeysBlind: createHasUnknownKeysFn(schema),
    unknownKeyErrors: createUnknownKeyErrorsFn(schema),
    clone: createCloneExactShapeFn(schema),
  });
}

// --- target: a discriminated union whose arms share a key ---
// Every arm declares `kind` and `id`, so the merged allowlist and the matched
// branch agree on those; only a name no arm declares is undeclared.
{
  const schema = RT.union([
    RT.object({kind: RT.literal('a'), id: TF.string(), only_a: TF.number()}),
    RT.object({kind: RT.literal('b'), id: TF.string(), only_b: RT.boolean()}),
  ]);
  targets.push({
    title: 'SharedDiscriminant',
    schema,
    divergesFromComposition: true,
    mock: createMockDataFn(schema),
    validate: createValidateFn(schema),
    getValidationErrors: createGetValidationErrorsFn(schema),
    validateStrict: createValidateFn(schema, {checkUnknowns: true}),
    errorsStrict: createGetValidationErrorsFn(schema, {checkUnknowns: true}),
    hasUnknownKeys: createHasUnknownKeysFn(schema, {runsAfterValidation: true}),
    hasUnknownKeysBlind: createHasUnknownKeysFn(schema),
    unknownKeyErrors: createUnknownKeyErrorsFn(schema),
    jsonEncode: createJsonEncoderFn(schema),
    jsonDecode: createJsonDecoderFn(schema),
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
    // Anti-vacuity for O22–O25: a green run must have actually planted keys at
    // both kinds of position and decoded a planted wire, or it proved nothing.
    expect(report.unknownKeys.flagged, 'no key was planted at a flagged position').toBeGreaterThan(0);
    expect(report.unknownKeys.carveOut, 'no key was planted at an index-signature carve-out').toBeGreaterThan(0);
    expect(report.unknownKeys.wire, 'no encoded wire was planted on').toBeGreaterThan(0);
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

  // O25's anti-vacuity half. The oracle says "planting undeclared keys on the
  // wire does not change what the strip decoder returns", which a decoder that
  // returned nothing at all would also satisfy. This pins that the plant really
  // reaches the wire: the `preserve` decoder hands the key back, the `strip`
  // decoder blanks it, and the declared data survives both.
  it('O25 reference: a planted wire key is kept by preserve and blanked by strip', () => {
    const schema = RT.object({id: TF.number(), meta: RT.object({count: TF.number()})});
    const strip = createJsonDecoderFn(schema, {strategy: 'strip'});
    const preserve = createJsonDecoderFn(schema, {strategy: 'preserve'});
    const wire = '{"id":1,"meta":{"count":2,"__fz_uk_wire":"fz"},"__fz_uk_wire":"fz"}';
    const preserved = preserve(wire) as Record<string, unknown>;
    expect(preserved.__fz_uk_wire).toBe('fz');
    expect((preserved.meta as Record<string, unknown>).__fz_uk_wire).toBe('fz');
    const stripped = strip(wire) as Record<string, unknown>;
    expect(stripped.__fz_uk_wire).toBeUndefined();
    expect((stripped.meta as Record<string, unknown>).__fz_uk_wire).toBeUndefined();
    expect(stripped.id).toBe(1);
    expect((stripped.meta as Record<string, unknown>).count).toBe(2);
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
