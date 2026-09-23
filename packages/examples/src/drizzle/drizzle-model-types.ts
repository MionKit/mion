import * as DZ from '@mionjs/drizzle-orm-pg-core';
import type {
  InferInsertModel,
  InferSelectModel,
  InferUpdateModel,
} from '@mionjs/drizzle-orm';

export const users = DZ.pgTable('users', {
  id: DZ.uuid('id').primaryKey().defaultRandom(),
  email: DZ.varchar('email', {length: 254}).notNull(),
  name: DZ.varchar('name', {length: 100}).notNull(),
  bio: DZ.varchar('bio', {length: 500}),
  createdAt: DZ.timestamp('created_at').defaultNow().notNull(),
});

// every key present, bio is value | null
export type User = InferSelectModel<typeof users>;

// id and createdAt have defaults, so inserts may omit them
export type NewUser = InferInsertModel<typeof users>;

export type UserPatch = InferUpdateModel<typeof users>;

// a NewUser route input checks the varchar lengths and goes into db.insert(...).values() uncast
