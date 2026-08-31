import {createHasUnknownKeysFn, createValidateFn} from '@ts-runtypes/core';

type Address = {street: string; city: string};
type User = {id: number; name: string; address: Address};

// The compile-time `runsAfterValidation` option declares a precondition: every
// value passed to this predicate has already PASSED validate for the same
// type. The emitter then swaps the key-array scan for a key-count compare on
// all-required shapes (~3x on small objects, ~13x at 30 props) and drops the
// per-object typeof guards. The precondition is about the value, so it holds
// all the way down: `address` is checked the same fast way, whether it is
// written inline or named as its own type. Calling it on non-validated input
// is undefined behavior: keep it behind a validate like the strict guard below.
const isUser = createValidateFn<User>();
const hasExtraFast = createHasUnknownKeysFn<User>(undefined, {runsAfterValidation: true});

export function isUserStrict(data: unknown): data is User {
  return isUser(data) && !hasExtraFast(data);
}

const address = {street: '10 Main', city: 'Springfield'};

isUserStrict({id: 1, name: 'Ada', address}); // true
isUserStrict({id: 1, name: 'Ada', address, admin: true}); // false, `admin` isn't in User
isUserStrict({id: 1, name: 'Ada', address: {...address, zip: '90210'}}); // false, nested extra key
