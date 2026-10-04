// MySQL tables written as types, the same schema as mysql.builders.ts.
import * as DZ from '@mionjs/drizzle-orm-mysql-core';
import {sql, type TableRef} from '@mionjs/drizzle-orm';
import type {InferInsertModel, InferSelectModel, InferSelectViewModel} from '@mionjs/drizzle-orm';
import {drizzle} from 'drizzle-orm/mysql-proxy';
import {gt, relations} from 'drizzle-orm';
import {mysqlView} from 'drizzle-orm/mysql-core';
import {toDrizzle} from '@mionjs/drizzle-orm-mysql-core/drizzle';
import {answer} from './fakeDriver.ts';

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
    authorId: DZ.Varchar<{length: 36; notNull: true; references: [TableRef<UsersTable, 'id'>]}>;
    title: DZ.Varchar<{length: 200; notNull: true}>;
    tags: DZ.Json<{$type: [string[]]; notNull: true}>;
    views: DZ.Int<{notNull: true; default: [0]}>;
    publishedAt: DZ.Timestamp;
  },
  [],
  {authorId: 'author_id'; publishedAt: 'published_at'}
>;

export const users = DZ.tableFromType<UsersTable>();
export const posts = DZ.tableFromType<PostsTable>({tables: {users}});

// A view has no type form: it stays a builder.
export const adultUsers = DZ.mysqlView('adult_users', {
  id: DZ.varchar('id', {length: 36, notNull: true}),
  name: DZ.varchar('name', {length: 100, notNull: true}),
  age: DZ.int('age', {notNull: true}),
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

export const usersDb = toDrizzle<UsersTable>();
export const postsDb = toDrizzle<PostsTable>({tables: {users}});
export const adultUsersDb = toDrizzle(adultUsers);

// Query-builder views stay on drizzle (drizzle-migrate-query-builder-view).
export const busyAuthorsDb = mysqlView('busy_authors').as((qb) =>
  qb.select({authorId: postsDb.authorId, views: postsDb.views}).from(postsDb).where(gt(postsDb.views, 100))
);

export const usersRelations = relations(usersDb, ({many}) => ({posts: many(postsDb)}));
export const postsRelations = relations(postsDb, ({one}) => ({
  author: one(usersDb, {fields: [postsDb.authorId], references: [usersDb.id]}),
}));

export const schema = {users: usersDb, posts: postsDb, usersRelations, postsRelations};

export const db = drizzle(answer, {schema});
