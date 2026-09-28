import * as DZ from '@mionjs/drizzle-orm-mysql-core';
import {sql} from '@mionjs/drizzle-orm';
import type {InferInsertModel, InferSelectModel, InferSelectViewModel, InferUpdateModel} from '@mionjs/drizzle-orm';

// The same schema as mysql.schema.ts, written as types.

export type UsersTable = DZ.MysqlTable<
  'users',
  {
    id: DZ.Varchar<{length: 36; primaryKey: true}>;
    name: DZ.Varchar<{length: 100; notNull: true}>;
    email: DZ.Varchar<{length: 255; notNull: true}>;
    age: DZ.Int<{notNull: true}>;
    role: DZ.Varchar<{length: 10; enum: ['admin', 'user']; notNull: true}>;
    active: DZ.Boolean<{notNull: true}>;
    balance: DZ.Bigint<{mode: 'bigint'; notNull: true}>;
    createdAt: DZ.Timestamp<{defaultNow: true; notNull: true}>;
  },
  [],
  {createdAt: 'created_at'}
>;

export type PostsTable = DZ.MysqlTable<
  'posts',
  {
    id: DZ.Varchar<{length: 36; primaryKey: true}>;
    authorId: DZ.Varchar<{length: 36; notNull: true}>;
    title: DZ.Varchar<{length: 200; notNull: true}>;
    tags: DZ.Json<{$type: [string[]]; notNull: true}>;
    views: DZ.Int<{notNull: true; default: [0]}>;
    publishedAt: DZ.Timestamp;
  },
  [],
  {authorId: 'author_id'; publishedAt: 'published_at'}
>;

export const users = DZ.tableFromType<UsersTable>();
export const posts = DZ.tableFromType<PostsTable>();

// a view has no type form: it stays a builder, over the type-form table
export const adultUsers = DZ.mysqlView('adult_users', {
  id: DZ.varchar('id', {length: 36, notNull: true}),
  name: DZ.varchar('name', {length: 100, notNull: true}),
  age: DZ.int('age', {notNull: true}),
}).as(sql`select id, name, age from ${users} where age >= 18`);

export type User = InferSelectModel<UsersTable>;
export type NewUser = InferInsertModel<UsersTable>;
export type UserPatch = InferUpdateModel<UsersTable>;
export type Post = InferSelectModel<PostsTable>;
export type AdultUser = InferSelectViewModel<typeof adultUsers>;
