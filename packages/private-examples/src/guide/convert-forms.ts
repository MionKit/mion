import * as RT from '@mionjs/run-types/builders';
import * as TF from '@mionjs/run-types/formats';
import {
  createValidateFn,
  getRunTypeId,
  type InferType,
} from '@mionjs/run-types';

// start-before
// before
export type User = {
  id: number;
  name?: string;
  tags: string[];
};
// end-before

// start-after-builders
// after mion convert --to builders
export const userRT = RT.object({
  id: TF.number(),
  name: RT.optional(TF.string()),
  tags: RT.array(TF.string()),
});
export type UserAsBuilders = InferType<typeof userRT>; // the real command keeps the name User
// end-after-builders

// start-identity
getRunTypeId<User>() === getRunTypeId(userRT); // true
// end-identity

// start-call-sites
// before
export const isOrder = createValidateFn<{id: string; total: number}>();
// end-call-sites

// start-call-sites-after
// after: the same shape, so the same validator
export const isOrderBuilt = createValidateFn(
  RT.object({id: TF.string(), total: TF.number()})
);
getRunTypeId<{id: string; total: number}>() ===
  getRunTypeId(RT.object({id: TF.string(), total: TF.number()})); // true
// end-call-sites-after
