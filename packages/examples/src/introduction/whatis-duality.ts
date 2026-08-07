import * as TF from '@ts-runtypes/core/formats';
import {createValidateFn, type InferType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';

// start-type
// Option A — a plain TypeScript type. Fastest, zero ceremony.
type UserFromType = {
  id: number;
  name: string;
  email: string;
};

const isUserA = createValidateFn<UserFromType>();
// end-type

// start-builder
// Option B — the RT.* builders, if you like the Zod / TypeBox feel.
const userSchema = RT.object({
  id: TF.number(),
  name: TF.string(),
  email: TF.email(),
});

// Recover the type from the run-type whenever you need it.
type UserFromSchema = InferType<typeof userSchema>;

const isUserB = createValidateFn(userSchema);
// end-builder

export {isUserA, isUserB};
export type {UserFromSchema};
