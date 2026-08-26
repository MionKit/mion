import {toDrizzlePGTable} from '@mionjs/drizzle';
import type {InsertModel, SelectModel, UpdateModel} from '@mionjs/drizzle';
import {uuid, timestamp} from 'drizzle-orm/pg-core';
// Note: Must use regular import (not `import type`) for reflection to work
import {UUIDv4, Email} from '@ts-runtypes/core/formats';

/** The app type is the source of truth: formats carry the validation rules */
interface User {
  id: UUIDv4;
  email: Email;
  name: string;
  bio?: string;
  createdAt: Date;
}

export const users = toDrizzlePGTable<User>('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// The tableConfig gives id and createdAt defaults, so inserts may omit them:
export type NewUser = InsertModel<User, never, 'id' | 'createdAt'>;

// Update payloads accept any subset of the insert payload:
export type UserPatch = UpdateModel<User>;

// What a select returns: every key present, bio comes back as string | null:
export type UserRow = SelectModel<User>;

// These are plain type transforms over User, so every format and its params survive.
// A route input typed NewUser validates email as an Email, and the payload flows
// straight into db.insert(users).values(payload) with no casting.
