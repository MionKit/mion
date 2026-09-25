import * as TF from '@mionjs/run-types/formats';
import {createValidateFn, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

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
