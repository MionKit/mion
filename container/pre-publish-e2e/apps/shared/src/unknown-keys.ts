// Family 7, unknown keys. Mirrors guide/unknown-keys-check-unknowns.ts and guide/remove-unknown-keys.ts.
import {createRemoveUnknownKeysFn, createValidateFn, createGetValidationErrorsFn} from '@mionjs/run-types';
import {type CheckResult, ok} from './check';

interface User {
  id: number;
  name: string;
}

export const isUserStrict = createValidateFn<User>(undefined, {checkUnknowns: true});
export const removeExtras = createRemoveUnknownKeysFn<User>();
export const userStrictErrors = createGetValidationErrorsFn<User>(undefined, {checkUnknowns: true});

export function checkUnknownKeys(): CheckResult[] {
  const clean = {id: 1, name: 'Ada'};
  const dirty = {id: 1, name: 'Ada', admin: true, token: 'secret'};

  const cloned = removeExtras(dirty) as Record<string, unknown>;
  const errs = userStrictErrors(dirty);

  return [
    ok('unknown-keys: checkUnknowns → true when no extras', isUserStrict(clean)),
    ok('unknown-keys: checkUnknowns → false when extras present', !isUserStrict(dirty)),
    ok('unknown-keys: clone drops undeclared keys', !('admin' in cloned) && !('token' in cloned) && cloned.id === 1 && cloned.name === 'Ada'),
    ok('unknown-keys: clone never mutates the input', 'admin' in dirty && dirty.token === 'secret'),
    ok('unknown-keys: clone is a fresh value', (cloned as unknown) !== (dirty as unknown)),
    ok('unknown-keys: errors reports one entry per undeclared key', errs.length === 2 && errs.every((err) => err.expected === 'never')),
  ];
}
