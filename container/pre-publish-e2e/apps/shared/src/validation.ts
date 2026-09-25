// Family 1 — Validation & errors. Mirrors packages/private-examples/src/guide/
// validation-*.ts against the PUBLISHED @mionjs/run-types surface.
import {createValidateFn, createGetValidationErrorsFn} from '@mionjs/run-types';
import {type CheckResult, eq, ok} from './check';

export interface Account {
  id: number;
  name: string;
  roles: ('admin' | 'user')[];
}

export const isAccount = createValidateFn<Account>();
export const accountErrors = createGetValidationErrorsFn<Account>();

// Exercises the CompTimeArgs path: the option literal is read at build time, never at runtime.
export const isAccountStrict = createValidateFn<Account>(undefined, {checkUnknowns: true});

export function checkValidation(): CheckResult[] {
  const good = {id: 1, name: 'Ada', roles: ['admin'] as ('admin' | 'user')[]};
  const bad = {id: '1', name: 42, roles: ['boss']};
  const errs = accountErrors(bad);
  return [
    ok('validation: valid → true', isAccount(good)),
    ok('validation: invalid → false', !isAccount(bad)),
    ok('validation: getValidationErrors reports a broken path', errs.length > 0 && errs.some((error) => error.path[0] === 'id')),
    ok('validation: checkUnknowns variant rejects an undeclared key', isAccountStrict(good) && !isAccountStrict({...good, extra: 1})),
    eq('validation: valid input yields zero errors', accountErrors(good).length, 0),
  ];
}
