import type * as TF from '@mionjs/run-types/formats';
import {createValidateFn} from '@mionjs/run-types';

// Type-first formats: import a Format* alias and annotate. The constraint
// lives in the type. The build reads it and validates accordingly.
type Account = {
  id: TF.UUIDv4;
  email: TF.Email;
  age: TF.Int32;
  credits: TF.Positive;
};

const isAccount = createValidateFn<Account>();

isAccount({
  id: '109156be-c4fb-41ea-b1b4-efe1671c5836',
  email: 'ada@example.com',
  age: 36,
  credits: 100,
}); // true

isAccount({id: 'not-a-uuid', email: 'nope', age: 1.5, credits: -5}); // false

export {isAccount};
export type {Account};
