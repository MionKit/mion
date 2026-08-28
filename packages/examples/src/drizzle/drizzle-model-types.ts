// The model payload types carry the same names drizzle uses, derived straight
// from the recorded table: every format and its params survive into payloads.
import * as DB from '@mionjs/drizzle-orm-pg-core';
import type {InferInsertModel, InferSelectModel, InferUpdateModel} from '@mionjs/drizzle-orm';

export const usersRT = DB.pgTable('users', {
  id: DB.uuid('id').primaryKey().defaultRandom(),
  email: DB.varchar('email', {length: 254}).notNull(),
  name: DB.varchar('name', {length: 100}).notNull(),
  bio: DB.varchar('bio', {length: 500}),
  createdAt: DB.timestamp('created_at').defaultNow().notNull(),
});

// What a select returns: every key present, bio comes back as value | null:
export type User = InferSelectModel<typeof usersRT>;

// id and createdAt have DB defaults, so inserts may omit them:
export type NewUser = InferInsertModel<typeof usersRT>;

// Update payloads accept any subset of the insert payload:
export type UserPatch = InferUpdateModel<typeof usersRT>;

// A route input typed NewUser enforces the captured varchar lengths, and the
// payload flows straight into db.insert(...).values(payload) with no casting.
