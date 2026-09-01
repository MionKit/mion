// The model payload types, derived from a table written as a pure type: this
// file is types only, nothing runs and nothing is imported at runtime.
import * as DZ from '@mionjs/drizzle-orm-pg-core';
import type {InferInsertModel, InferSelectModel, InferUpdateModel} from '@mionjs/drizzle-orm';

export type UsersTable = DZ.PgTable<
  'users',
  {
    id: DZ.Uuid<'id', {primaryKey: true; defaultRandom: true}>;
    email: DZ.Varchar<'email', {length: 254; notNull: true}>;
    name: DZ.Varchar<'name', {length: 100; notNull: true}>;
    bio: DZ.Varchar<'bio', {length: 500}>;
    createdAt: DZ.Timestamp<'created_at', {defaultNow: true; notNull: true}>;
  }
>;

// What a select returns: every key present, bio comes back as value | null:
export type User = InferSelectModel<UsersTable>;

// id and createdAt have DB defaults, so inserts may omit them:
export type NewUser = InferInsertModel<UsersTable>;

// Update payloads accept any subset of the insert payload:
export type UserPatch = InferUpdateModel<UsersTable>;

// A route input typed NewUser enforces the captured varchar lengths, and the
// payload flows straight into db.insert(...).values(payload) with no casting.
