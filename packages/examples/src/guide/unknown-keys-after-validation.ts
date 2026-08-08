import {createHasUnknownKeysFn, createValidateFn} from '@ts-runtypes/core';

type User = {id: number; name: string};

// The compile-time `runsAfterValidation` option declares a precondition: every
// value passed to this predicate has already PASSED validate for the same
// type. The emitter then swaps the key-array scan for a key-count compare on
// all-required shapes (~3x on small objects, ~44x at 30 props) and drops the
// per-object typeof guards. Calling it on non-validated input is undefined
// behavior: keep it behind a validate like the strict guard below.
const isUser = createValidateFn<User>();
const hasExtraFast = createHasUnknownKeysFn<User>(undefined, {runsAfterValidation: true});

export function isUserStrict(data: unknown): data is User {
  return isUser(data) && !hasExtraFast(data);
}

isUserStrict({id: 1, name: 'Ada'}); // true
isUserStrict({id: 1, name: 'Ada', admin: true}); // false, `admin` isn't in User
