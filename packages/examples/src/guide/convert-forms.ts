import * as RT from '@mionjs/run-types/builders';
import * as TF from '@mionjs/run-types/formats';
import {
  createValidateFn,
  getRunTypeId,
  type InferType,
} from '@mionjs/run-types';

// start-before
// A file you might have today, written type-first.
export type User = {
  id: number;
  name?: string;
  tags: string[];
};
// end-before

// start-after-builders
// The same declaration after `mion convert --to builders`: the const
// carries the shape, and the alias keeps the type name alive so nothing that
// imported `User` breaks.
export const userRT = RT.object({
  id: TF.number(),
  name: RT.optional(TF.string()),
  tags: RT.array(TF.string()),
});
export type UserAsBuilders = InferType<typeof userRT>;
// end-after-builders

// start-identity
// Conversion never moves a type's identity: both spellings resolve to
// the same id, so they share one generated validator, codec and mock pool.
getRunTypeId<User>() === getRunTypeId(userRT); // true
// end-identity

// start-call-sites
// A type written straight into a factory call has no declaration to rewrite,
// so the converter rewrites the call itself. Before:
export const isOrder = createValidateFn<{id: string; total: number}>();
// end-call-sites

// start-call-sites-after
// And after converting to type builders, the same call with the type as a
// value. It reflects the same shape, so it is the same validator.
export const isOrderBuilt = createValidateFn(
  RT.object({id: TF.string(), total: TF.number()})
);
getRunTypeId<{id: string; total: number}>() ===
  getRunTypeId(RT.object({id: TF.string(), total: TF.number()})); // true
// end-call-sites-after
