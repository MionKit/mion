// The model payload types, derived from a table written as a pure type: this
// file is types only, nothing runs and nothing is imported at runtime.
import * as DB from '@mionjs/drizzle-orm-pg-core';
import type {InferInsertModel, InferSelectModel, InferUpdateModel} from '@mionjs/drizzle-orm';

export type UsersTable = DB.PgTable<
  'users',
  {
    id: DB.Uuid<'id'> & DB.PrimaryKey & DB.DefaultRandom;
    email: DB.Varchar<'email', {length: 254}> & DB.NotNull;
    name: DB.Varchar<'name', {length: 100}> & DB.NotNull;
    bio: DB.Varchar<'bio', {length: 500}>;
    createdAt: DB.Timestamp<'created_at'> & DB.DefaultNow & DB.NotNull;
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
