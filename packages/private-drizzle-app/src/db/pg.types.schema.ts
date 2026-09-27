import * as DZ from '@mionjs/drizzle-orm-pg-core';
import type {InferInsertModel, InferSelectModel} from '@mionjs/drizzle-orm';

// The same schema as pg.schema.ts, written as types.

export type UsersTable = DZ.PgTable<
  'users',
  {
    id: DZ.Uuid<{defaultRandom: true; primaryKey: true}>;
    name: DZ.Varchar<{length: 100; notNull: true}>;
    email: DZ.Varchar<{length: 255; notNull: true}>;
    age: DZ.Integer<{notNull: true}>;
    role: DZ.Text<{enum: ['admin', 'user']; notNull: true}>;
    balance: DZ.Bigint<{mode: 'bigint'; notNull: true}>;
    createdAt: DZ.Timestamp<{defaultNow: true; notNull: true}>;
  },
  [],
  {createdAt: 'created_at'}
>;

export type PostsTable = DZ.PgTable<
  'posts',
  {
    id: DZ.Uuid<{defaultRandom: true; primaryKey: true}>;
    authorId: DZ.Uuid<{notNull: true}>;
    title: DZ.Varchar<{length: 200; notNull: true}>;
    tags: DZ.Text<{array: true; notNull: true}>;
    views: DZ.Integer<{notNull: true; default: [0]}>;
    publishedAt: DZ.Timestamp;
  },
  [],
  {authorId: 'author_id'; publishedAt: 'published_at'}
>;

export const users = DZ.tableFromType<UsersTable>();
export const posts = DZ.tableFromType<PostsTable>();

export type User = InferSelectModel<UsersTable>;
export type NewUser = InferInsertModel<UsersTable>;
export type Post = InferSelectModel<PostsTable>;
