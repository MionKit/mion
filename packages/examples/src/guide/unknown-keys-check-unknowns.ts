import {createGetValidationErrorsFn, createValidateFn} from '@mionjs/run-types';

type Address = {street: string; city: string};
type User = {id: number; name: string; address: Address};

// `checkUnknowns` folds the unknown-key check into the validator, so one
// function answers "matches User, and carries no extra properties". The value
// is walked once instead of twice, and nested types are covered at every level.
const isUserStrict = createValidateFn<User>(undefined, {checkUnknowns: true});

isUserStrict({id: 1, name: 'Ada', address: {street: 'Main', city: 'Rome'}}); // true
isUserStrict({
  id: 1,
  name: 'Ada',
  address: {street: 'Main', city: 'Rome'},
  admin: true,
}); // false
isUserStrict({
  id: 1,
  name: 'Ada',
  address: {street: 'Main', city: 'Rome', zip: '00184'},
}); // false, the extra is nested

// The same option on the error report: each undeclared key adds one entry with
// `expected: 'never'`, alongside the usual type errors.
const userErrors = createGetValidationErrorsFn<User>(undefined, {
  checkUnknowns: true,
});

userErrors({
  id: 1,
  name: 'Ada',
  address: {street: 'Main', city: 'Rome', zip: '00184'},
});
// [{path: ['address', 'zip'], expected: 'never'}]

// A union needs its own option. Its members share one list of property names, so a property
// belonging to another member survives, and a member with an index signature declares them all.
type Pet = {kind: 'cat'; meows: boolean} | {kind: 'dog'; barks: number};
type Something = {a: string} | Record<string, number>;

const isPetUnionStrict = createValidateFn<Pet>(undefined, {
  checkUnionUnknowns: true,
});
isPetUnionStrict({kind: 'cat', meows: true}); // true
isPetUnionStrict({kind: 'cat', meows: true, barks: 3}); // false, barks belongs to Dog

const isSomething = createValidateFn<Something>(undefined, {
  checkUnionUnknowns: true,
});
isSomething({a: 'x'}); // true
isSomething({p: 1, q: 2}); // true, it is a record
isSomething({a: 'x', evil: 'garbage'}); // false, it matches neither member

export {isUserStrict, userErrors, isPetUnionStrict, isSomething};
