import * as TF from '@mionjs/run-types/formats';
import {createValidateFn, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

const userRunType = RT.object({
  id: TF.number(),
  name: TF.string(),
  email: TF.email(),
  roles: RT.array(RT.union([RT.literal('admin'), RT.literal('user')])),
});

// take the type back out, then generate from it as usual
type User = InferType<typeof userRunType>;
const isUser = createValidateFn<User>();

isUser({id: 1, name: 'Ada', email: 'ada@example.com', roles: ['admin']}); // true
