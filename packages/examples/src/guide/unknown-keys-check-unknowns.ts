import {createGetValidationErrorsFn, createValidateFn} from '@ts-runtypes/core';

type Address = {street: string; city: string};
type User = {id: number; name: string; address: Address};

// `checkUnknowns` folds the unknown-key check into the validator, so one
// function answers "matches User, and carries no extra properties". The value
// is walked once instead of twice, and nested types are covered at every level.
const isUserStrict = createValidateFn<User>(undefined, {checkUnknowns: true});

isUserStrict({id: 1, name: 'Ada', address: {street: 'Main', city: 'Rome'}}); // true
isUserStrict({id: 1, name: 'Ada', address: {street: 'Main', city: 'Rome'}, admin: true}); // false
isUserStrict({id: 1, name: 'Ada', address: {street: 'Main', city: 'Rome', zip: '00184'}}); // false, the extra is nested

// The same option on the error report: each undeclared key adds one entry with
// `expected: 'never'`, alongside the usual type errors.
const userErrors = createGetValidationErrorsFn<User>(undefined, {checkUnknowns: true});

userErrors({id: 1, name: 'Ada', address: {street: 'Main', city: 'Rome', zip: '00184'}});
// [{path: ['address', 'zip'], expected: 'never'}]

export {isUserStrict, userErrors};
