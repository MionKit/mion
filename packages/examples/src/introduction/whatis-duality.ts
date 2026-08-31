import * as TF from '@mionjs/run-types/formats';
import {createValidateFn, type InferType} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';

// start-type
// Option A: a plain TypeScript type. Fastest, zero ceremony.
type UserFromType = {
  id: number;
  name: string;
  email: string;
};

const isUserA = createValidateFn<UserFromType>();
// end-type

// start-builder
// Option B: the RT.* builders, if you like the Zod / TypeBox feel.
const userRunType = RT.object({
  id: TF.number(),
  name: TF.string(),
  email: TF.email(),
});

// Recover the type from the run-type whenever you need it.
type UserFromRunType = InferType<typeof userRunType>;

const isUserB = createValidateFn(userRunType);
// end-builder

export {isUserA, isUserB};
export type {UserFromRunType};
