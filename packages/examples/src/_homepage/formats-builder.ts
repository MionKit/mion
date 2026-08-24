import * as TF from '@ts-runtypes/core/formats';
import {createValidateFn, type InferType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';

// The same formats through the RT.* type builders.
const account = RT.object({
  id: TF.uuidv4(),
  email: TF.email(),
  ip: TF.ipv4(),
  logins: TF.positiveInt(),
});

// Recover the TypeScript type from the run-type.
type Account = InferType<typeof account>;

const isAccount = createValidateFn(account);
