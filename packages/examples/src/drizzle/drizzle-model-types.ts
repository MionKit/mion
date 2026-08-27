// The insert/select/update model utilities compose with proxy-built tables:
// plain type transforms, so every format and its params survive into payloads.
import {pgTable, uuid, varchar, timestamp} from '@mionjs/drizzle/pg';
import type {InsertModel, SelectModel, UpdateModel} from '@mionjs/drizzle/pg';
import type {InferSelectModel} from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', {length: 254}).notNull(),
  name: varchar('name', {length: 100}).notNull(),
  bio: varchar('bio', {length: 500}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

type User = InferSelectModel<typeof users>;

// id and createdAt have DB defaults, so inserts may omit them:
export type NewUser = InsertModel<User, never, 'id' | 'createdAt'>;

// Update payloads accept any subset of the insert payload:
export type UserPatch = UpdateModel<User>;

// What a select returns: every key present, bio comes back as value | null:
export type UserRow = SelectModel<User>;

// A route input typed NewUser enforces the captured varchar lengths, and the
// payload flows straight into db.insert(users).values(payload) with no casting.
