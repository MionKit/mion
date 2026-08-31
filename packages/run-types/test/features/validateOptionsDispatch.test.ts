// ValidateOptions variant dispatch — the JS-side guarantees that lock in the
// "creating the same type with different ValidateOptions works" contract:
//
//   1. The structural type id is a function of T only. Passing options
//      never changes the id (`getRunTypeId<T>()` returns the same value
//      regardless of options the caller passes elsewhere for the same T).
//   2. Each `(family, options-tuple)` pair dispatches to a DISTINCT
//      cached factory — different variant cache keys (`val_<id>` vs
//      `itNL_<id>` vs `valNA_<id>` vs `itNLA_<id>`).
//   3. The variant body actually changes behaviour: the `noLiterals`
//      variant accepts the base kind beyond the exact literal; the
//      `noIsArrayCheck` variant skips the leading `Array.isArray` guard.
//   4. Schema-form (`createValidateFn`) converges with marker-form for
//      the same `T + options` — both resolve the same `<fnHash>_<typeId>`
//      cache key and get a factory that exhibits the same behaviour.
//
// Style mirrors the existing reference-identity guards in
// `tupleStructuralId.test.ts` and the id-integrity suite —
// `.toBe` is a cache-identity check, `.not.toBe` is a cache-distinct
// check. Behavioural assertions backstop the dispatch — they catch
// the case where the JS variant key lookup misses and silently falls
// back to the identity validator.

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

  it('string[] id is identical whether referenced bare or via a noIsArrayCheck call site', () => {
    const bareId: string = getRunTypeId<string[]>();
    // Build the variant factory at this call site too — its sole job is
    // to prove the id-emitting marker doesn't fold options into the id.
    const variantFactory = createValidateFn<string[]>(undefined, {noIsArrayCheck: true});
    expect(variantFactory).toBeTypeOf('function');
    const afterId: string = getRunTypeId<string[]>();
    expect(afterId).toBe(bareId);
  });
});

describe('ValidateOptions — different option tuples dispatch to distinct cached factories', () => {
  it("`createValidateFn<'a'>()` and `createValidateFn<'a'>(undefined, {noLiterals: true})` are different cached fns", () => {
    expect(createValidateFn<'a'>()).not.toBe(createValidateFn<'a'>(undefined, {noLiterals: true}));
  });

  it('`createValidateFn<string[]>()` and `createValidateFn<string[]>(undefined, {noIsArrayCheck: true})` are different cached fns', () => {
    expect(createValidateFn<string[]>()).not.toBe(createValidateFn<string[]>(undefined, {noIsArrayCheck: true}));
  });

  it('the same T with the same options resolves to ONE cached factory', () => {
    expect(createValidateFn<string[]>(undefined, {noIsArrayCheck: true})).toBe(
      createValidateFn<string[]>(undefined, {noIsArrayCheck: true})
    );
  });
});

describe('ValidateOptions — variant bodies actually differ in behaviour', () => {
  it("plain `'a'` rejects `'b'`; `noLiterals` variant accepts every string", () => {
    const plain = createValidateFn<'a'>();
    const variant = createValidateFn<'a'>(undefined, {noLiterals: true});
    expect(plain('a')).toBe(true);
    expect(plain('b')).toBe(false);
    expect(variant('a')).toBe(true);
    expect(variant('b')).toBe(true);
    expect(variant(42)).toBe(false);
  });

  it('plain `string[]` rejects a non-array; `noIsArrayCheck` variant lets non-array values past the guard', () => {
    const plain = createValidateFn<string[]>();
    const variant = createValidateFn<string[]>(undefined, {noIsArrayCheck: true});
    // Plain validator rejects 42 (typeof !== array).
    expect(plain(42)).toBe(false);
    // Variant strips the Array.isArray guard — 42 has no .length, the
    // for-loop body never enters, so the validator passes. Mirrors the
    // documented trade-off (Array.ts:570-573).
    expect(variant(42)).toBe(true);
    // Both still walk elements when an array is supplied.
    expect(plain(['x'])).toBe(true);
    expect(variant(['x'])).toBe(true);
    expect(plain([42])).toBe(false);
    expect(variant([42])).toBe(false);
  });
});

describe('ValidateOptions — getValidationErrors variant parity with validate', () => {
  it('`noLiterals` variant of getValidationErrors uses the base-kind label', () => {
    const errors = createGetValidationErrorsFn<'a'>(undefined, {noLiterals: true});
    // `noLiterals` accepts any string — including the non-matching 'b' —
    // so the expected error array is empty.
    expect(errors('b')).toEqual([]);
    // A non-string still fails, with the base-kind label `string`.
    const out = errors(42);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({path: [], expected: 'string'});
  });

  it('`noIsArrayCheck` variant of getValidationErrors skips the top-level array guard', () => {
    const errors = createGetValidationErrorsFn<string[]>(undefined, {noIsArrayCheck: true});
    // Non-array input: no top-level error, no inner element loop runs.
    expect(errors(42)).toEqual([]);
    // Array with a bad element: the element check still fires.
    expect(errors([42])[0]).toMatchObject({path: [0], expected: 'string'});
  });
});

describe('ValidateOptions — schema-form ⇄ marker-form convergence', () => {
  it('plain schema-form and plain marker-form both reject `[42]` for `string[]`', () => {
    const marker = createValidateFn<string[]>();
    const schema = createValidateFn(RT.array(TF.string()));
    expect(marker([42])).toBe(false);
    expect(schema([42])).toBe(false);
  });

  it('schema-form `noIsArrayCheck` variant skips the guard, just like the marker form', () => {
    const marker = createValidateFn<string[]>(undefined, {noIsArrayCheck: true});
    const schema = createValidateFn(RT.array(TF.string()), {noIsArrayCheck: true});
    // Both let a non-array slip past the guard…
    expect(marker(42)).toBe(true);
    expect(schema(42)).toBe(true);
    // …but still reject a bad element.
    expect(marker([42])).toBe(false);
    expect(schema([42])).toBe(false);
  });

  it('schema-form `noIsArrayCheck` variant agrees with marker-form on getValidationErrors output', () => {
    const marker = createGetValidationErrorsFn<string[]>(undefined, {noIsArrayCheck: true});
    const schema = createGetValidationErrorsFn(RT.array(TF.string()), {noIsArrayCheck: true});
    expect(marker(42)).toEqual([]);
    expect(schema(42)).toEqual([]);
    expect(marker([42])).toEqual(schema([42]));
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

  it('numberMode combines with noLiterals on a numeric literal (distinct factories, typeof base)', () => {
    type Three = 3;
    const plain = createValidateFn<Three>();
    const noLit = createValidateFn<Three>(undefined, {noLiterals: true});
    const noLitTypeof = createValidateFn<Three>(undefined, {noLiterals: true, numberMode: 'typeof'});
    expect(plain).not.toBe(noLit);
    expect(noLit).not.toBe(noLitTypeof);
    // plain: exactly 3; noLiterals: any finite number; +typeof: any number incl NaN.
    expect(plain(3)).toBe(true);
    expect(plain(4)).toBe(false);
    expect(noLit(4)).toBe(true);
    expect(noLit(NaN)).toBe(false);
    expect(noLitTypeof(NaN)).toBe(true);
  });
});

describe('ValidateOptions — combined variants build the multi-letter suffix', () => {
  it('`{noLiterals: true, noIsArrayCheck: true}` resolves to a factory distinct from each single-option variant', () => {
    type T = readonly 'x'[];
    const plain = createValidateFn<T>();
    const nlOnly = createValidateFn<T>(undefined, {noLiterals: true});
    const naOnly = createValidateFn<T>(undefined, {noIsArrayCheck: true});
    const both = createValidateFn<T>(undefined, {noLiterals: true, noIsArrayCheck: true});
    // All four are distinct cache entries — proves the variant suffix
    // is constructed from both options together (`NLA`), not collapsed
    // to one of the singles.
    expect(plain).not.toBe(nlOnly);
    expect(plain).not.toBe(naOnly);
    expect(plain).not.toBe(both);
    expect(nlOnly).not.toBe(naOnly);
    expect(nlOnly).not.toBe(both);
    expect(naOnly).not.toBe(both);
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
  type ArrayUnion = string[] | {b: number};

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

  it('noLiterals: `{a: "zzz"}` validates, so the report must be empty', () => {
    const validate = createValidateFn<LiteralUnion>(undefined, {noLiterals: true});
    const errors = createGetValidationErrorsFn<LiteralUnion>(undefined, {noLiterals: true});
    // The repro: plain rejects the off-literal, noLiterals accepts it.
    expect(createValidateFn<LiteralUnion>()({a: 'zzz'})).toBe(false);
    expect(validate({a: 'zzz'})).toBe(true);
    expect(errors({a: 'zzz'})).toEqual([]);
    expectAgreement(validate, errors, literalValues);
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

  it('noIsArrayCheck: the union arm that skips the array guard agrees too', () => {
    const validate = createValidateFn<ArrayUnion>(undefined, {noIsArrayCheck: true});
    const errors = createGetValidationErrorsFn<ArrayUnion>(undefined, {noIsArrayCheck: true});
    expectAgreement(validate, errors, [['x'], [42], {b: 1}, {b: 'x'}, 42, 'nope']);
  });

  it('combined options: noLiterals + numberMode resolve one shared variant', () => {
    const options = {noLiterals: true, numberMode: 'typeof'} as const;
    const validate = createValidateFn<LiteralUnion>(undefined, options);
    const errors = createGetValidationErrorsFn<LiteralUnion>(undefined, options);
    expect(validate({a: 'zzz'})).toBe(true);
    expect(validate({b: NaN})).toBe(true);
    expectAgreement(validate, errors, literalValues);
  });

  it('marker coverage: the value-first call shape agrees the same way', () => {
    const sample: LiteralUnion = {a: 'x'};
    const validate = createValidateFn(sample, {noLiterals: true});
    const errors = createGetValidationErrorsFn(sample, {noLiterals: true});
    expect(validate({a: 'zzz'})).toBe(true);
    expect(errors({a: 'zzz'})).toEqual([]);
    expectAgreement(validate, errors, literalValues);
    // The options never fold into the id — static and value-first agree.
    expect(getRunTypeId<LiteralUnion>()).toBe(getRunTypeId(sample));
  });
});
