import * as TF from '@ts-runtypes/core/formats';
import {createValidateFn, type InferType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';

// Prefer builders? Describe the same shape with the RT.* type builders (Zod / TypeBox style).
const userRunType = RT.object({
  id: TF.number(),
  name: TF.string(),
  email: TF.email(),
  roles: RT.array(RT.union([RT.literal('admin'), RT.literal('user')])),
});

// Same validator, same result — your call.
const isUser = createValidateFn(userRunType);

// Recover the TypeScript type from the run-type whenever you need it.
type User = InferType<typeof userRunType>;
