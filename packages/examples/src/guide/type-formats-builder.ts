import * as TF from '@ts-runtypes/core/formats';
import {createValidateFn, type InferType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';

// Builder formats: the same constraints as builders. TF.email(),
// TF.uuidv4(), TF.int32(), TF.positive(). Pick the style you like.
const account = RT.object({
  id: TF.uuidv4(),
  email: TF.email(),
  age: TF.int32(),
  credits: TF.positive(),
});

// InferType<typeof runType> hands the TypeScript type back.
type Account = InferType<typeof account>;

const isAccount = createValidateFn(account);

export {account, isAccount};
export type {Account};
