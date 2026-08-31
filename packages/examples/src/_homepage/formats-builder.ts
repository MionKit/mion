import * as TF from '@mionjs/run-types/formats';
import {createValidateFn, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

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
