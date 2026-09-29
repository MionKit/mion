// A validation override must also run when `checkUnknowns` / `checkUnionUnknowns` swap the call to its key-checking family.

import {it, expect} from 'vitest';
import {createValidateFn, overrideValidate, createGetValidationErrorsFn, overrideGetValidationErrors} from '@mionjs/run-types';

type KeyTarget = {readonly __brand: 'keyCheckOverride'; a: number};
overrideValidate<KeyTarget>((v): v is KeyTarget => (v as {a?: number} | null)?.a === 1);
overrideGetValidationErrors<KeyTarget>((value, path, errors) => {
  const out = errors ?? [];
  out.push({path: path ?? [], expected: 'override'} as never);
  return out;
});

type KeyParent = {inner: KeyTarget; b: string};
type KeyUnion = {kind: 'keyCheckX'; t: KeyTarget} | {kind: 'keyCheckY'; n: number};

const target: KeyTarget = {__brand: 'keyCheckOverride', a: 1};
const parent: KeyParent = {inner: target, b: 'x'};
const member: KeyUnion = {kind: 'keyCheckX', t: target};

// The generated body would reject `overridePass` (no brand, extra key) and accept `overrideFail`; the override does the opposite.
const overridePass = {a: 1, extra: true};
const overrideFail = {__brand: 'keyCheckOverride', a: 2};

type Validate = (value: unknown) => boolean;
type Errors = (value: unknown) => {expected?: string}[];

function assertValidate(title: string, validate: Validate): void {
  expect(validate(overridePass), `${title}: pass`).toBe(true);
  expect(validate(overrideFail), `${title}: fail`).toBe(false);
}

function assertErrors(title: string, getErrors: Errors): void {
  const errors = getErrors(overridePass);
  expect(errors, title).toHaveLength(1);
  expect(errors[0].expected, title).toBe('override');
}

/** Registers the key-check option it()s (call inside a describe). */
export function registerKeyCheckOptionsCase(): void {
  it('KeyCheckOptions — validate override runs with and without the key-check options', () => {
    assertValidate('plain', createValidateFn<KeyTarget>());
    assertValidate('checkUnknowns', createValidateFn<KeyTarget>(undefined, {checkUnknowns: true}));
    assertValidate('checkUnionUnknowns', createValidateFn<KeyTarget>(undefined, {checkUnionUnknowns: true}));
    assertValidate('value plain', createValidateFn(target));
    assertValidate('value checkUnknowns', createValidateFn(target, {checkUnknowns: true}));
    assertValidate('value checkUnionUnknowns', createValidateFn(target, {checkUnionUnknowns: true}));
  });

  it('KeyCheckOptions — getValidationErrors override runs with and without the key-check options', () => {
    assertErrors('plain', createGetValidationErrorsFn<KeyTarget>() as Errors);
    assertErrors('checkUnknowns', createGetValidationErrorsFn<KeyTarget>(undefined, {checkUnknowns: true}) as Errors);
    assertErrors('checkUnionUnknowns', createGetValidationErrorsFn<KeyTarget>(undefined, {checkUnionUnknowns: true}) as Errors);
    assertErrors('value plain', createGetValidationErrorsFn(target) as Errors);
    assertErrors('value checkUnknowns', createGetValidationErrorsFn(target, {checkUnknowns: true}) as Errors);
    assertErrors('value checkUnionUnknowns', createGetValidationErrorsFn(target, {checkUnionUnknowns: true}) as Errors);
  });

  it('KeyCheckOptions — checkUnknowns runs a nested override and still checks the parent keys', () => {
    for (const validate of [
      createValidateFn<KeyParent>(undefined, {checkUnknowns: true}),
      createValidateFn(parent, {checkUnknowns: true}),
    ]) {
      expect(validate({inner: overridePass, b: 'x'})).toBe(true);
      expect(validate({inner: overrideFail, b: 'x'})).toBe(false);
      expect(validate({inner: overridePass, b: 'x', extra: 1})).toBe(false);
    }
    for (const getErrors of [
      createGetValidationErrorsFn<KeyParent>(undefined, {checkUnknowns: true}),
      createGetValidationErrorsFn(parent, {checkUnknowns: true}),
    ]) {
      const errors = (getErrors as Errors)({inner: overridePass, b: 'x', extra: 1});
      expect(errors).toHaveLength(2);
      expect(errors.filter((error) => error.expected === 'override')).toHaveLength(1);
    }
  });

  it('KeyCheckOptions — checkUnionUnknowns runs a nested override and still checks the member keys', () => {
    for (const validate of [
      createValidateFn<KeyUnion>(undefined, {checkUnionUnknowns: true}),
      createValidateFn(member, {checkUnionUnknowns: true}),
    ]) {
      expect(validate({kind: 'keyCheckX', t: overridePass})).toBe(true);
      expect(validate({kind: 'keyCheckX', t: overrideFail})).toBe(false);
      expect(validate({kind: 'keyCheckX', t: overridePass, n: 3})).toBe(false);
    }
    for (const getErrors of [
      createGetValidationErrorsFn<KeyUnion>(undefined, {checkUnionUnknowns: true}),
      createGetValidationErrorsFn(member, {checkUnionUnknowns: true}),
    ]) {
      // A union reports one `union` error when no member matches, and the override decides whether one does.
      expect((getErrors as Errors)({kind: 'keyCheckX', t: overridePass})).toEqual([]);
      expect((getErrors as Errors)({kind: 'keyCheckX', t: overrideFail})).toEqual([{expected: 'union', path: []}]);
      expect((getErrors as Errors)({kind: 'keyCheckX', t: overridePass, n: 3})).toEqual([{expected: 'union', path: []}]);
    }
  });
}
