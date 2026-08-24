// Family 1 — Validation & errors. Mirrors packages/examples/src/guide/
// validation-*.ts against the PUBLISHED @ts-runtypes/core surface.
import {createValidateFn, createGetValidationErrorsFn} from '@ts-runtypes/core';
import {type CheckResult, eq, ok} from './check';

export interface Account {
  id: number;
  name: string;
  roles: ('admin' | 'user')[];
}

export const isAccount = createValidateFn<Account>();
export const accountErrors = createGetValidationErrorsFn<Account>();

// A build-time option literal routes the call to a specialized validator arm —
// exercises the CompTimeArgs path (nothing is read at runtime).
export const isAccountLoose = createValidateFn<Account>(undefined, {noLiterals: true});

export function checkValidation(): CheckResult[] {
  const good = {id: 1, name: 'Ada', roles: ['admin'] as ('admin' | 'user')[]};
  const bad = {id: '1', name: 42, roles: ['boss']};
  const errs = accountErrors(bad);
  return [
    ok('validation: valid → true', isAccount(good)),
    ok('validation: invalid → false', !isAccount(bad)),
    ok('validation: getValidationErrors reports a broken path', errs.length > 0 && errs.some((error) => error.path[0] === 'id')),
    // noLiterals degrades 'admin'|'user' to plain string, so an unknown role now passes.
    ok('validation: noLiterals variant accepts a non-literal role', isAccountLoose({id: 2, name: 'Bo', roles: ['boss'] as never})),
    eq('validation: valid input yields zero errors', accountErrors(good).length, 0),
  ];
}
