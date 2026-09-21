// The email format's validate lane and its error lane must pick the same rules.
//
// createValidateFn<T>() and createGetValidationErrorsFn<T>() must always agree —
// for every value v, `validate(v) === (getValidationErrors(v).length === 0)`
// (fuzz oracle O4). The email emitter has three roads (a baked pattern, the RFC
// grammar under `emailRfc`, and the localPart/domain split) and it used to test
// them in one order for validate and the opposite order for the error list. A
// format carrying both `emailRfc` and a localPart therefore checked the split and
// reported nothing: `EmailAddress<{localPart: {maxLength: 8}}>` fed
// 'averyveryverylonglocalpart@example.com' gave validate=false and errors=[].
//
// That pair is now rejected, so this spec pins the two halves it can reach from
// TypeScript: O4 on each of the three roads, and the pair no longer being
// spellable. The emitted lanes are pinned in Go
// (internal/cachegen/typefunctions/formats/string/email_lane_agreement_test.go).

import type * as TF from '@mionjs/run-types/formats';
import {describe, expect, it} from 'vitest';
import {createValidateFn, createGetValidationErrorsFn, getRunTypeId} from '@mionjs/run-types';
import '@mionjs/run-types/formats';

// A local part one character over EmailStrict's 64, so the split road rejects it.
const LONG_LOCAL_PART = `${'a'.repeat(65)}@example.com`;

function expectAgreement<T>(validate: (v: unknown) => boolean, errors: (v: unknown) => unknown[], values: string[]) {
  for (const value of values) {
    expect(validate(value), `validate(${value})`).toBe(errors(value).length === 0);
  }
}

describe('the email lanes agree on every road (O4)', () => {
  it('the pattern road — TF.Email', () => {
    const validate = createValidateFn<TF.Email>();
    const errors = createGetValidationErrorsFn<TF.Email>();
    expect(validate('joe@example.com')).toBe(true);
    expect(errors('joe@example.com')).toEqual([]);
    expect(validate('nope')).toBe(false);
    expect(errors('nope').length).toBeGreaterThan(0);
    expectAgreement(validate, errors, ['joe@example.com', 'nope', '', LONG_LOCAL_PART, 'a@b']);
  });

  it('the RFC road — TF.EmailAddress', () => {
    const validate = createValidateFn<TF.EmailAddress>();
    const errors = createGetValidationErrorsFn<TF.EmailAddress>();
    expect(validate('joe@example.com')).toBe(true);
    expect(errors('joe@example.com')).toEqual([]);
    expect(validate('not-an-email')).toBe(false);
    expect(errors('not-an-email').length).toBeGreaterThan(0);
    expectAgreement(validate, errors, ['joe@example.com', '"joe bloggs"@example.com', 'not-an-email', '', LONG_LOCAL_PART]);
  });

  it('the split road — TF.EmailStrict', () => {
    const validate = createValidateFn<TF.EmailStrict>();
    const errors = createGetValidationErrorsFn<TF.EmailStrict>();
    expect(validate('joe@example.com')).toBe(true);
    expect(errors('joe@example.com')).toEqual([]);
    // The bug's shape: an over-long local part must show up in BOTH lanes.
    expect(validate(LONG_LOCAL_PART)).toBe(false);
    expect(errors(LONG_LOCAL_PART).length).toBeGreaterThan(0);
    expectAgreement(validate, errors, ['joe@example.com', LONG_LOCAL_PART, 'no-at-sign', 'joe@tld', '']);
  });

  // Marker coverage: the value-inferred shape resolves to the same entry as the
  // static one, and agrees the same way.
  it('the value-inferred form agrees too, on the same entry', () => {
    const sample: TF.EmailAddress = 'joe@example.com';
    const validate = createValidateFn(sample);
    const errors = createGetValidationErrorsFn(sample);
    expect(validate('joe@example.com')).toBe(true);
    expect(errors('not-an-email').length).toBeGreaterThan(0);
    expectAgreement(validate, errors, ['joe@example.com', 'not-an-email', '']);
    expect(getRunTypeId(sample)).toBe(getRunTypeId<TF.EmailAddress>());
  });
});

// The pair itself is unspellable now: the type-level rejection lives in
// test/types/typesafety.test.ts (assertionsEmailPresetRoads), where a regression
// shows up as an unused @ts-expect-error.
describe('the RFC presets keep their own bounds', () => {
  it('a retuned minLength still applies', () => {
    const validate = createValidateFn<TF.EmailAddress<{minLength: 10}>>();
    const errors = createGetValidationErrorsFn<TF.EmailAddress<{minLength: 10}>>();
    expect(validate('joe@example.com')).toBe(true);
    expect(validate('a@b.co')).toBe(false);
    expectAgreement(validate, errors, ['joe@example.com', 'a@b.co', 'not-an-email']);
  });
});
