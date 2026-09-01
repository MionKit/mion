// The model payload types carry the same names drizzle uses, derived straight
// from the recorded table: every format and its params survive into payloads.
import * as DZ from '@mionjs/drizzle-orm-pg-core';
import type {InferInsertModel, InferSelectModel, InferUpdateModel} from '@mionjs/drizzle-orm';

export const users = DZ.pgTable('users', {
  id: DZ.uuid('id').primaryKey().defaultRandom(),
  email: DZ.varchar('email', {length: 254}).notNull(),
  name: DZ.varchar('name', {length: 100}).notNull(),
  bio: DZ.varchar('bio', {length: 500}),
  createdAt: DZ.timestamp('created_at').defaultNow().notNull(),
});

// What a select returns: every key present, bio comes back as value | null:
export type User = InferSelectModel<typeof users>;

// id and createdAt have DB defaults, so inserts may omit them:
export type NewUser = InferInsertModel<typeof users>;

// Update payloads accept any subset of the insert payload:
export type UserPatch = InferUpdateModel<typeof users>;

// A route input typed NewUser enforces the captured varchar lengths, and the
// payload flows straight into db.insert(...).values(payload) with no casting.
