import * as DZ from '@mionjs/drizzle-orm-pg-core';
import type {InferInsertModel, InferSelectModel} from '@mionjs/drizzle-orm';

export const users = DZ.pgTable('users', {
  id: DZ.uuid('id', {primaryKey: true, defaultRandom: true}),
  email: DZ.varchar('email', {length: 254, notNull: true}),
  name: DZ.varchar('name', {length: 100, notNull: true}),
  bio: DZ.varchar('bio', {length: 500}),
  createdAt: DZ.timestamp('created_at', {defaultNow: true, notNull: true}),
});

// every key present, bio is value | null
export type User = InferSelectModel<typeof users>;

// id and createdAt have defaults, so inserts may omit them
export type NewUser = InferInsertModel<typeof users>;

export type UserPatch = Partial<InferInsertModel<typeof users>>;

// a NewUser route input checks the varchar lengths and goes into db.insert(...).values() uncast
