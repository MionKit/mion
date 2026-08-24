// Family 7 — Unknown-keys. Mirrors guide/unknown-keys-*.ts. The three
// undeclared-key handlers: has / cloneExactShape / errors. (The mutating
// strip / toUndefined factories were removed in 0.10.0 — cloneExactShape is
// the non-mutating replacement.)
import {createCloneExactShapeFn, createHasUnknownKeysFn, createUnknownKeyErrorsFn} from '@ts-runtypes/core';
import {type CheckResult, ok} from './check';

interface User {
  id: number;
  name: string;
}

export const hasExtra = createHasUnknownKeysFn<User>();
export const cloneExact = createCloneExactShapeFn<User>();
export const extraKeyErrors = createUnknownKeyErrorsFn<User>();

export function checkUnknownKeys(): CheckResult[] {
  const clean = {id: 1, name: 'Ada'};
  const dirty = {id: 1, name: 'Ada', admin: true, token: 'secret'};

  const cloned = cloneExact(dirty) as Record<string, unknown>;
  const errs = extraKeyErrors(dirty);

  return [
    ok('unknown-keys: has → false when no extras', !hasExtra(clean)),
    ok('unknown-keys: has → true when extras present', hasExtra(dirty)),
    ok('unknown-keys: clone drops undeclared keys', !('admin' in cloned) && !('token' in cloned) && cloned.id === 1 && cloned.name === 'Ada'),
    ok('unknown-keys: clone never mutates the input', 'admin' in dirty && dirty.token === 'secret'),
    ok('unknown-keys: clone is a fresh value', (cloned as unknown) !== (dirty as unknown)),
    ok('unknown-keys: errors reports one entry per undeclared key', errs.length === 2),
  ];
}
