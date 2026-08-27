import {pgTable, uuid, varchar, integer, timestamp} from '@mionjs/drizzle-orm-pg-core';
import type {InferSelectModel} from 'drizzle-orm';
import {createValidateFn} from '@ts-runtypes/core';
// @annotate: Declare drizzle tables as usual, importing the column builders from @mionjs/drizzle-orm-pg-core

const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
// @annotate: The inferred model carries formats, not plain primitives: UUID, String<{maxLength: 100}>, Int32

type User = InferSelectModel<typeof users>;
// @annotate: The compiled validator enforces every captured param with no runtime guards

export const validateUser = createValidateFn<User>();
