import * as DZ from '@mionjs/drizzle-orm-pg-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {createValidateFn} from '@mionjs/run-types';
// @annotate: Declare drizzle tables as usual, with the column builders from @mionjs/drizzle-orm-pg-core

const users = DZ.pgTable('users', {
  id: DZ.uuid('id', {primaryKey: true, defaultRandom: true}),
  name: DZ.varchar('name', {length: 100, notNull: true}),
  age: DZ.integer('age', {notNull: true}),
  createdAt: DZ.timestamp('created_at', {defaultNow: true, notNull: true}),
});
// @annotate: The inferred model carries formats, not plain primitives: UUID, String<{maxLength: 100}>, Int32

type User = InferSelectModel<typeof users>;
// @annotate: The compiled validator enforces every captured param with no runtime guards

export const validateUser = createValidateFn<User>();
