// SQLite tables written as types, the same schema as sqlite.builders.ts.
import * as DZ from '@mionjs/drizzle-orm-sqlite-core';
import {sql, type TableRef} from '@mionjs/drizzle-orm';
import type {InferInsertModel, InferSelectModel, InferSelectViewModel} from '@mionjs/drizzle-orm';

export type UsersTable = DZ.SqliteTable<
  'users',
  {
    id: DZ.Text<{primaryKey: true}>;
    name: DZ.Text<{length: 100; notNull: true}>;
    email: DZ.Text<{length: 255; notNull: true}>;
    age: DZ.Integer<{notNull: true}>;
    role: DZ.Text<{enum: ['admin', 'user']; notNull: true}>;
    active: DZ.Integer<{mode: 'boolean'; notNull: true}>;
    balance: DZ.Blob<{mode: 'bigint'; notNull: true}>;
    createdAt: DZ.Integer<{mode: 'timestamp'; notNull: true}>;
  },
  [],
  {createdAt: 'created_at'}
>;

export type PostsTable = DZ.SqliteTable<
  'posts',
  {
    id: DZ.Text<{primaryKey: true}>;
    authorId: DZ.Text<{notNull: true; references: [TableRef<UsersTable, 'id'>]}>;
    title: DZ.Text<{length: 200; notNull: true}>;
    tags: DZ.Text<{mode: 'json'; $type: [string[]]; notNull: true}>;
    views: DZ.Integer<{notNull: true; default: [0]}>;
    publishedAt: DZ.Integer<{mode: 'timestamp'}>;
  },
  [],
  {authorId: 'author_id'; publishedAt: 'published_at'}
>;

export const users = DZ.tableFromType<UsersTable>();
export const posts = DZ.tableFromType<PostsTable>({tables: {users}});

// A view has no type form: it stays a builder.
export const adultUsers = DZ.sqliteView('adult_users', {
  id: DZ.text('id', {notNull: true}),
  name: DZ.text('name', {length: 100, notNull: true}),
  age: DZ.integer('age', {notNull: true}),
}).as(sql`select id, name, age from ${users} where age >= 18`);

export type User = InferSelectModel<UsersTable>;
export type NewUser = InferInsertModel<UsersTable>;
export type UserPatch = Partial<InferInsertModel<UsersTable>>;
export type Post = InferSelectModel<PostsTable>;
export type NewPost = InferInsertModel<PostsTable>;
export type PostPatch = Partial<InferInsertModel<PostsTable>>;
// A query-builder view has no slim model, so its row type is written by hand.
export type BusyAuthor = Pick<Post, 'authorId' | 'views'>;
export type AdultUser = InferSelectViewModel<typeof adultUsers>;
