// ValidateOptions variant dispatch, the JS-side guarantees behind "the same type with different ValidateOptions works":
//   1. The structural type id is a function of T only; options never change it.
//   2. Each (family, options) pair dispatches to a DISTINCT cached factory.
//   3. The variant body changes behaviour (numberMode picks the base number check).
//   4. Schema form converges with marker form for the same T + options.
// `.toBe` is a cache-identity check, `.not.toBe` a cache-distinct one; behavioural asserts catch a missed variant lookup.

import * as TF from '@mionjs/run-types/formats';
import {describe, expect, it} from 'vitest';
import {createValidateFn, createGetValidationErrorsFn, getRunTypeId} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

describe('ValidateOptions — type-id stays structural across option combinations', () => {
  it('static and reflect forms of the same T share the same id', () => {
    const staticId = getRunTypeId<'a'>();
    const v = 'a' as const;
    const reflectId = getRunTypeId(v);
    expect(staticId).toBe(reflectId);
  });

  it('number[] id is identical whether referenced bare or via a numberMode call site', () => {
    const bareId: string = getRunTypeId<number[]>();
    // Builds the variant at this call site only to prove the id marker does not fold options into the id.
    const variantFactory = createValidateFn<number[]>(undefined, {numberMode: 'typeof'});
    expect(variantFactory).toBeTypeOf('function');
    const afterId: string = getRunTypeId<number[]>();
    expect(afterId).toBe(bareId);
  });
});

describe('ValidateOptions — different option tuples dispatch to distinct cached factories', () => {
  it("`createValidateFn<number[]>()` and `createValidateFn<number[]>(undefined, {numberMode: 'typeof'})` are different cached fns", () => {
    expect(createValidateFn<number[]>()).not.toBe(createValidateFn<number[]>(undefined, {numberMode: 'typeof'}));
  });

  it('the same T with the same options resolves to ONE cached factory', () => {
    expect(createValidateFn<number[]>(undefined, {numberMode: 'notNaN'})).toBe(
      createValidateFn<number[]>(undefined, {numberMode: 'notNaN'})
    );
  });
});

describe('ValidateOptions — schema-form ⇄ marker-form convergence', () => {
  it('plain schema-form and plain marker-form both reject `[42]` for `string[]`', () => {
    const marker = createValidateFn<string[]>();
    const schema = createValidateFn(RT.array(TF.string()));
    expect(marker([42])).toBe(false);
    expect(schema([42])).toBe(false);
  });

  it('schema-form numberMode variant accepts NaN elements, just like the marker form', () => {
    const marker = createValidateFn<number[]>(undefined, {numberMode: 'typeof'});
    const schema = createValidateFn(RT.array(TF.number()), {numberMode: 'typeof'});
    expect(marker([NaN])).toBe(true);
    expect(schema([NaN])).toBe(true);
    expect(marker(['x'])).toBe(false);
    expect(schema(['x'])).toBe(false);
  });

  it('schema-form numberMode variant agrees with marker-form on getValidationErrors output', () => {
    const marker = createGetValidationErrorsFn<number[]>(undefined, {numberMode: 'typeof'});
    const schema = createGetValidationErrorsFn(RT.array(TF.number()), {numberMode: 'typeof'});
    expect(marker([NaN])).toEqual([]);
    expect(schema([NaN])).toEqual([]);
    expect(marker(['x'])).toEqual(schema(['x']));
  });
});

describe('ValidateOptions — numberMode selects the base number check', () => {
  it('numberMode variants dispatch to distinct cached factories; explicit isFinite collapses to the plain entry', () => {
    const plain = createValidateFn<number>();
    const asTypeof = createValidateFn<number>(undefined, {numberMode: 'typeof'});
    const notNaN = createValidateFn<number>(undefined, {numberMode: 'notNaN'});
    expect(plain).not.toBe(asTypeof);
    expect(plain).not.toBe(notNaN);
    expect(asTypeof).not.toBe(notNaN);
    // 'isFinite' is the default → no variant → same cached factory as plain.
    expect(createValidateFn<number>(undefined, {numberMode: 'isFinite'})).toBe(plain);
  });

  it('plain (isFinite) rejects NaN/Infinity; typeof accepts them; notNaN rejects NaN but accepts Infinity', () => {
    const isFiniteFn = createValidateFn<number>();
    const asTypeof = createValidateFn<number>(undefined, {numberMode: 'typeof'});
    const notNaN = createValidateFn<number>(undefined, {numberMode: 'notNaN'});
    // Finite numbers pass under every mode.
    for (const fn of [isFiniteFn, asTypeof, notNaN]) expect(fn(1.5)).toBe(true);
    // NaN: rejected by isFinite + notNaN, accepted by typeof.
    expect(isFiniteFn(NaN)).toBe(false);
    expect(asTypeof(NaN)).toBe(true);
    expect(notNaN(NaN)).toBe(false);
    // Infinity: rejected only by isFinite.
    expect(isFiniteFn(Infinity)).toBe(false);
    expect(asTypeof(Infinity)).toBe(true);
    expect(notNaN(Infinity)).toBe(true);
    expect(notNaN(-Infinity)).toBe(true);
    // Non-numbers are rejected regardless of mode.
    expect(asTypeof('x')).toBe(false);
    expect(notNaN({})).toBe(false);
  });

  it('value-first createValidateFn(value) honours numberMode too (marker coverage rule); id stays structural', () => {
    const n: number = 1;
    const asTypeof = createValidateFn(n, {numberMode: 'typeof'});
    expect(asTypeof(NaN)).toBe(true);
    expect(asTypeof('x')).toBe(false);
    // numberMode never folds into the type id — static and reflect ids agree.
    expect(getRunTypeId<number>()).toBe(getRunTypeId(n));
  });

  it('getValidationErrors honours numberMode: typeof accepts NaN where isFinite reports an error', () => {
    const errFinite = createGetValidationErrorsFn<number>();
    const errTypeof = createGetValidationErrorsFn<number>(undefined, {numberMode: 'typeof'});
    expect(errFinite(NaN)).toHaveLength(1);
    expect(errFinite(NaN)[0]).toMatchObject({path: [], expected: 'number'});
    expect(errTypeof(NaN)).toEqual([]);
  });
});

describe('ValidateOptions — numberMode reaches format-annotated numbers (Float and friends)', () => {
  it('Float honours every numberMode exactly like a plain number (the tag adds no failable check)', () => {
    const isFiniteFn = createValidateFn<TF.Float>();
    const asTypeof = createValidateFn<TF.Float>(undefined, {numberMode: 'typeof'});
    const notNaN = createValidateFn<TF.Float>(undefined, {numberMode: 'notNaN'});
    // Finite values pass under every mode, whole values (2) included.
    for (const fn of [isFiniteFn, asTypeof, notNaN]) {
      expect(fn(1.5)).toBe(true);
      expect(fn(2)).toBe(true);
    }
    // NaN: rejected by isFinite + notNaN, accepted by typeof.
    expect(isFiniteFn(NaN)).toBe(false);
    expect(asTypeof(NaN)).toBe(true);
    expect(notNaN(NaN)).toBe(false);
    // Infinity: rejected only by isFinite.
    expect(isFiniteFn(Infinity)).toBe(false);
    expect(asTypeof(Infinity)).toBe(true);
    expect(notNaN(Infinity)).toBe(true);
  });

  it('a bounded number format under typeof still rejects NaN via the bound, not the base', () => {
    const boundedTypeof = createValidateFn<TF.Number<{min: 0}>>(undefined, {numberMode: 'typeof'});
    expect(boundedTypeof(Infinity)).toBe(true); // Infinity >= 0
    expect(boundedTypeof(NaN)).toBe(false); // NaN >= 0 is false — the bound fails, as it must
  });

  it('marker coverage: value-first Float shape honours numberMode and shares the structural id', () => {
    const sample: TF.Float = 1.5;
    const asTypeof = createValidateFn(sample, {numberMode: 'typeof'});
    expect(asTypeof(NaN)).toBe(true);
    expect(asTypeof('x')).toBe(false);
    expect(getRunTypeId<TF.Float>()).toBe(getRunTypeId(sample));
  });
});

// A union's getValidationErrors body has no per-arm error breakdown: it asks a
// validator for the verdict and records one `{expected:'union'}` entry when the
// answer is no. That delegate has to be the validator compiled with the SAME
// options as the error function, or the two contradict each other — the caller
// validates, gets `true`, asks for a report anyway and is handed an error.
describe('ValidateOptions — a union error function agrees with its own validator', () => {
  type LiteralUnion = {a: 'x'} | {b: number};
  type NumberUnion = {n: number} | {s: string};

  // The contract, checked value by value: an empty error list exactly when the
  // paired validator says true.
  const expectAgreement = (validate: (value: unknown) => boolean, errors: (value: unknown) => unknown[], values: unknown[]) => {
    for (const value of values) {
      expect({value, empty: errors(value).length === 0}).toEqual({value, empty: validate(value)});
    }
  };

  const literalValues = [{a: 'x'}, {a: 'zzz'}, {b: 1}, {b: NaN}, {c: 1}, 'nope', null];
  const numberValues = [{n: 1}, {n: NaN}, {n: Infinity}, {s: 'x'}, {s: 1}, undefined];

  it('plain: union errors agree with the plain validator', () => {
    expectAgreement(createValidateFn<LiteralUnion>(), createGetValidationErrorsFn<LiteralUnion>(), literalValues);
  });

  it('numberMode typeof: `{n: NaN}` validates, so the report must be empty', () => {
    const validate = createValidateFn<NumberUnion>(undefined, {numberMode: 'typeof'});
    const errors = createGetValidationErrorsFn<NumberUnion>(undefined, {numberMode: 'typeof'});
    expect(createValidateFn<NumberUnion>()({n: NaN})).toBe(false);
    expect(validate({n: NaN})).toBe(true);
    expect(errors({n: NaN})).toEqual([]);
    expectAgreement(validate, errors, numberValues);
  });

  it('numberMode notNaN: NaN still fails, Infinity passes, and both views agree', () => {
    const validate = createValidateFn<NumberUnion>(undefined, {numberMode: 'notNaN'});
    const errors = createGetValidationErrorsFn<NumberUnion>(undefined, {numberMode: 'notNaN'});
    expect(validate({n: Infinity})).toBe(true);
    expect(validate({n: NaN})).toBe(false);
    expectAgreement(validate, errors, numberValues);
  });

  it('marker coverage: the value-first call shape agrees the same way', () => {
    const sample: NumberUnion = {n: 1};
    const validate = createValidateFn(sample, {numberMode: 'typeof'});
    const errors = createGetValidationErrorsFn(sample, {numberMode: 'typeof'});
    expect(validate({n: NaN})).toBe(true);
    expect(errors({n: NaN})).toEqual([]);
    expectAgreement(validate, errors, numberValues);
    // The options never fold into the id, so static and value-first agree.
    expect(getRunTypeId<NumberUnion>()).toBe(getRunTypeId(sample));
  });
});
