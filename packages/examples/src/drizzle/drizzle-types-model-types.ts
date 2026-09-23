import * as DZ from '@mionjs/drizzle-orm-pg-core';
import type {
  InferInsertModel,
  InferSelectModel,
  InferUpdateModel,
} from '@mionjs/drizzle-orm';

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

// every key present, bio is value | null
export type User = InferSelectModel<UsersTable>;

// id and createdAt have defaults, so inserts may omit them
export type NewUser = InferInsertModel<UsersTable>;

export type UserPatch = InferUpdateModel<UsersTable>;

// a NewUser route input checks the varchar lengths and goes into db.insert(...).values() uncast
