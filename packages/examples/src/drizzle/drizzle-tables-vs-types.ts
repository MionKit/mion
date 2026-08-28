// Two ways to the same model. Both compile to the same validators, mocks and
// serializers; the type checker pins them mutually assignable at the bottom.
import * as DB from '@mionjs/drizzle-orm-pg-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {createValidateFn} from '@ts-runtypes/core';

// start-table
// Option A: record the table. The model derives from it, so nullability,
// defaults and insert rules stay in ONE place, and toDrizzle() gives you the
// real drizzle table for queries and migrations.
const usersRT = DB.pgTable('users', {
  id: DB.uuid('id').primaryKey().defaultRandom(),
  name: DB.varchar('name', {length: 100}).notNull(),
  age: DB.integer('age').notNull(),
  bio: DB.varchar('bio', {length: 500}),
});

type UserA = InferSelectModel<typeof usersRT>;
const isUserA = createValidateFn<UserA>();
// end-table

// start-types
// Option B: hand-write the row with the named type each builder exports.
// Same formats, zero table machinery (and no toDrizzle: there is no table).
type UserB = {
  id: DB.Uuid;
  name: DB.Varchar<100>;
  age: DB.Integer;
  bio: DB.Varchar<500> | null;
};

const isUserB = createValidateFn<UserB>();
// end-types

// The two models are the same type, pinned by the checker:
export const sameModel: [UserA, UserB] extends [UserB, UserA] ? 'identical' : never = 'identical';
export {isUserA, isUserB};
