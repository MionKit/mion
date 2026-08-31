import * as TF from '@mionjs/run-types/formats';
import {createValidateFn, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

// Prefer builders? Describe the same shape with the RT.* type builders (Zod / TypeBox style).
const userRunType = RT.object({
  id: TF.number(),
  name: TF.string(),
  email: TF.email(),
  roles: RT.array(RT.union([RT.literal('admin'), RT.literal('user')])),
});

// Recover the TypeScript type, then generate from the type. Same validator,
// same result. Used this way the builder itself adds zero generated data.
type User = InferType<typeof userRunType>;
const isUser = createValidateFn<User>();

isUser({id: 1, name: 'Ada', email: 'ada@example.com', roles: ['admin']}); // true
