import * as DB from '@mionjs/drizzle-orm-pg-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {createValidateFn} from '@mionjs/run-types';
// @annotate: Declare drizzle tables as usual, with the column builders from @mionjs/drizzle-orm-pg-core

const users = DB.pgTable('users', {
  id: DB.uuid('id').primaryKey().defaultRandom(),
  name: DB.varchar('name', {length: 100}).notNull(),
  age: DB.integer('age').notNull(),
  createdAt: DB.timestamp('created_at').defaultNow().notNull(),
});
// @annotate: The inferred model carries formats, not plain primitives: UUID, String<{maxLength: 100}>, Int32

type User = InferSelectModel<typeof users>;
// @annotate: The compiled validator enforces every captured param with no runtime guards

export const validateUser = createValidateFn<User>();
