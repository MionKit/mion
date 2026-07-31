// id-integrity assertions — verify that the value-first schema authoring path
// and the type-first path resolve to the SAME runtype (hence the same structural
// type id) for every case, reusing each case's EXISTING thunks (no new per-case
// data). Two reuse mechanisms, one per suite family:
//
//  - validators (validate / getValidationErrors): `createValidateFn` returns the CACHED
//    factory for a structural id, so reference identity (`toBe`) between the
//    schema-form factory and the type-form factory IS a same-id assertion — the
//    proven `.toBe` cached-factory idiom, generalised here to every case. Same
//    id ⇒ same cached runtype.
//  - serializers (json / binary encoders): the encoder is a fresh closure each
//    call, so identity doesn't apply; instead assert the schema-form encoder
//    produces byte-identical output to the type-form encoder (same default
//    strategy) on the case's samples — identical wire output ⇒ same resolved
//    runtype.
//
// Compile options (`noLiterals` / `noIsArrayCheck`) are folded into the cached
// factory's variant key, so an option-bearing type-first form converges only with
// a schema form that passes the SAME options — e.g. `createValidateFn<2>(…,
// {noLiterals: true})` resolves the `itNL_<literal-2 id>` variant, matched by
// `createValidateFn(RT.literal(2), {noLiterals: true})`, NOT by plain `RT.number()`.
// The validation cases mirror their options on the schema thunk, so no special
// casing is needed here.

import {expect} from 'vitest';
import type {Thunk, ValidationCase} from '../suites/validation/types.ts';
import type {SerializationCase} from '../suites/serialization/types.ts';
import {deepCloneForRoundTrip} from './equalsHelpers.ts';

function resolveThunk<T>(thunk: Thunk<T> | undefined): (() => T) | undefined {
  if (!thunk || thunk === 'not-supported') return undefined;
  return thunk;
}

/** Validator id-integrity: the value-first schema form and the type-first form
 *  must resolve to the SAME cached factory (reference identity) for both the
 *  validate and getValidationErrors families. Skips factoryThrows (both forms throw at
 *  build), idDivergent (known not to converge by design), and any case missing
 *  one of the two forms (`'not-supported'` / omitted). **/
export function assertValidatorIdIntegrity(c: ValidationCase): void {
  if (c.factoryThrows) return;
  if (c.idDivergent) return;

  const validate = resolveThunk(c.validate);
  const validateSchema = resolveThunk(c.validateSchema);
  if (validate && validateSchema) {
    expect(
      validateSchema(),
      `${c.title}: validate — value-first schema and type-first must resolve the SAME cached factory (same structural id)`
    ).toBe(validate());
  }

  const getValidationErrors = resolveThunk(c.getValidationErrors);
  const getValidationErrorsSchema = resolveThunk(c.getValidationErrorsSchema);
  if (getValidationErrors && getValidationErrorsSchema) {
    expect(
      getValidationErrorsSchema(),
      `${c.title}: getValidationErrors — value-first schema and type-first must resolve the SAME cached factory (same structural id)`
    ).toBe(getValidationErrors());
  }
}

/** DataOnly-equivalence: the validator built from `createValidateFn<DataOnly<T>>()`
 *  must produce the SAME verdicts on the case's samples as the bare-`T`
 *  validator — proving the `DataOnly` type mapping drops exactly the members
 *  the validator emitter drops.
 *
 *  This is a BEHAVIOURAL check, not a cached-factory identity (`.toBe`) check:
 *  the emitter keeps each dropped member as a `notSupported` node in the
 *  reflected tree (so reflection stays complete), so `DataOnly<{a; fn}>` and
 *  the raw `{a; fn}` validate identically yet carry DIFFERENT structural ids —
 *  different cache entries, different factory objects. Equivalent verdicts on
 *  the samples is the meaningful, emitter-faithful assertion: if `DataOnly`
 *  failed to drop a member (or dropped one it shouldn't), a `valid`/`invalid`
 *  sample's verdict would flip.
 *
 *  Skips `factoryThrows` (the bare-`T` factory throws at build) and
 *  `dataOnlyDivergent` (root-level non-data kinds where `DataOnly<T>` collapses
 *  to `never`, so its factory throws instead of validating), plus any case
 *  missing a DataOnly thunk. **/
export function assertDataOnlyEquivalence(c: ValidationCase): void {
  if (c.factoryThrows) return;
  if (c.dataOnlyDivergent) return;

  const {valid, invalid} = c.getSamples();

  const validateDataOnly = resolveThunk(c.validateDataOnly);
  if (validateDataOnly) {
    const isValid = validateDataOnly();
    valid.forEach((v, i) => {
      expect(isValid(v), `${c.title} [dataOnly]: valid[${i}] should pass`).toBe(true);
    });
    invalid.forEach((v, i) => {
      expect(isValid(v), `${c.title} [dataOnly]: invalid[${i}] should fail`).toBe(false);
    });
  }

  const getValidationErrorsDataOnly = resolveThunk(c.getValidationErrorsDataOnly);
  if (getValidationErrorsDataOnly) {
    const getErr = getValidationErrorsDataOnly();
    // When the case pins an exact expected-errors table (type-first validation
    // cases), assert deep-equality. Format-validation cases instead carry
    // `expectedFormatErrors` (format payloads, no `getExpectedErrors`) — for
    // those, assert the CONTRACT (valid → no errors, invalid → ≥1 error), which
    // still proves DataOnly didn't change the validated shape.
    if (c.getExpectedErrors) {
      const expected = c.getExpectedErrors();
      if (expected.length !== invalid.length) {
        throw new Error(
          `case ${c.title}: getExpectedErrors length (${expected.length}) must match invalid samples (${invalid.length})`
        );
      }
      valid.forEach((v, i) => {
        expect(getErr(v), `${c.title} [dataOnly]: valid[${i}] → no errors`).toEqual([]);
      });
      invalid.forEach((v, i) => {
        expect(getErr(v), `${c.title} [dataOnly]: invalid[${i}]`).toEqual(expected[i]);
      });
    } else {
      valid.forEach((v, i) => {
        expect(getErr(v), `${c.title} [dataOnly]: valid[${i}] → no errors`).toEqual([]);
      });
      invalid.forEach((v, i) => {
        expect(getErr(v).length, `${c.title} [dataOnly]: invalid[${i}] → ≥1 error`).toBeGreaterThan(0);
      });
    }
  }
}

/** Serializer id-integrity: the value-first schema encoder must produce output
 *  identical to the type-first encoder (same default strategy) — json strings
 *  byte-for-byte, binary buffers byte-for-byte. Identical wire output ⇒ the two
 *  forms resolved the same runtype. Skips broad/best-effort types and
 *  factory-throwing / `'not-supported'` cases.
 *
 *  NOTE on the id signal strength: the encoder is a fresh closure each call, so —
 *  unlike the validator driver — we cannot compare resolved structural ids by
 *  `.toBe` identity, and the runtime exposes no id on the encoder fn. Byte-equal
 *  output is therefore a slightly weaker signal (two output-equivalent but
 *  structurally-distinct runtypes would both pass here). That gap is closed from
 *  the other side by `id-integrity/distinctness.test.ts`, which pins that
 *  meaningfully-distinct types do NOT collapse to one cached factory — so a
 *  degenerate id scheme can't slip past both drivers. **/
export function assertSerializerIdIntegrity(c: SerializationCase): void {
  // Broad types (any/unknown/object) encode via identity and may throw on
  // non-serialisable members — not a reliable id signal.
  if (c.roundTripBestEffort) return;
  // Known structurally-distinct by design (e.g. enum vs its value-union): the
  // value-first builder can't reconstruct the nominal type, so wire output may
  // differ. Skip, same as the validator suite skips idDivergent.
  if (c.idDivergent) return;

  const schemaEncoder = resolveThunk(c.schemaEncoder);
  if (schemaEncoder && !c.factoryThrows) {
    const schemaEncode = schemaEncoder();
    const typeEncode = c.cloneEncoder();
    const {values} = (c.getTestDataForStringify ?? c.getTestData)();
    values.forEach((reference, i) => {
      const fromSchema = schemaEncode(deepCloneForRoundTrip(reference));
      const fromType = typeEncode(deepCloneForRoundTrip(reference));
      expect(fromSchema, `${c.title}: json — value-first schema encoder output must equal type-first [values[${i}]]`).toBe(
        fromType
      );
    });
  }

  const schemaBinaryEncoder = resolveThunk(c.schemaBinaryEncoder);
  const typeBinaryEncoder = resolveThunk(c.binaryEncoder);
  const binaryFactoryThrows = c.binaryFactoryThrows ?? c.factoryThrows ?? false;
  if (schemaBinaryEncoder && typeBinaryEncoder && !binaryFactoryThrows) {
    const schemaEncode = schemaBinaryEncoder();
    const typeEncode = typeBinaryEncoder();
    const {values} = (c.getBinaryTestData ?? c.getTestDataForStringify ?? c.getTestData)();
    values.forEach((reference, i) => {
      const fromSchema = schemaEncode(deepCloneForRoundTrip(reference));
      const fromType = typeEncode(deepCloneForRoundTrip(reference));
      expect(fromSchema, `${c.title}: binary — value-first schema encoder bytes must equal type-first [values[${i}]]`).toEqual(
        fromType
      );
    });
  }
}
