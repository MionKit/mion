import {createGetValidationErrorsFn, createValidateFn} from '@mionjs/run-types';

type Address = {street: string; city: string};
type User = {id: number; name: string; address: Address};

// one function, one pass: matches User and carries no extra property, at every level
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

// same option on the error report: one entry per undeclared key, `expected: 'never'`
const userErrors = createGetValidationErrorsFn<User>(undefined, {
  checkUnknowns: true,
});

userErrors({
  id: 1,
  name: 'Ada',
  address: {street: 'Main', city: 'Rome', zip: '00184'},
});
// [{path: ['address', 'zip'], expected: 'never'}]

// a union needs its own option: its members share one list of property names
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
