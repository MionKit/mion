// Postgres, builder tables: the slim tables, their drizzle tables and every model type, in one file.
import * as DZ from '@mionjs/drizzle-orm-pg-core';
import {sql, tableRef} from '@mionjs/drizzle-orm';
import type {InferInsertModel, InferSelectModel, InferSelectViewModel, InferUpdateModel} from '@mionjs/drizzle-orm';
import {drizzle} from 'drizzle-orm/pg-proxy';
import {relations} from 'drizzle-orm';
import {pgView} from 'drizzle-orm/pg-core';
import {gt} from 'drizzle-orm';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import {answer} from './fakeDriver.ts';

export const users = DZ.pgTable('users', {
  id: DZ.uuid('id', {defaultRandom: true, primaryKey: true}),
  name: DZ.varchar('name', {length: 100, notNull: true}),
  email: DZ.varchar('email', {length: 255, notNull: true}),
  age: DZ.integer('age', {notNull: true}),
  role: DZ.text('role', {enum: ['admin', 'user'], notNull: true}),
  active: DZ.boolean('active', {notNull: true}),
  balance: DZ.bigint('balance', {mode: 'bigint', notNull: true}),
  createdAt: DZ.timestamp('created_at', {defaultNow: true, notNull: true}),
});

export const posts = DZ.pgTable('posts', {
  id: DZ.uuid('id', {defaultRandom: true, primaryKey: true}),
  authorId: DZ.uuid('author_id', {notNull: true, references: [() => tableRef(users, 'id')]}),
  title: DZ.varchar('title', {length: 200, notNull: true}),
  tags: DZ.text('tags', {array: true, notNull: true}),
  views: DZ.integer('views', {notNull: true, default: [0]}),
  publishedAt: DZ.timestamp('published_at'),
});

export const adultUsers = DZ.pgView('adult_users', {
  id: DZ.uuid('id', {notNull: true}),
  name: DZ.varchar('name', {length: 100, notNull: true}),
  age: DZ.integer('age', {notNull: true}),
}).as(sql`select id, name, age from ${users} where age >= 18`);

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type UserPatch = InferUpdateModel<typeof users>;
export type Post = InferSelectModel<typeof posts>;
export type NewPost = InferInsertModel<typeof posts>;
export type PostPatch = InferUpdateModel<typeof posts>;
// a view built from a query builder has no slim model: its row type is written by hand
export type BusyAuthor = Pick<Post, 'authorId' | 'views'>;
export type AdultUser = InferSelectViewModel<typeof adultUsers>;

// The query side.

export const usersDb = toDrizzle(users);
export const postsDb = toDrizzle(posts);
export const adultUsersDb = toDrizzle(adultUsers);

// a view built from a query builder stays on drizzle (DRZ001), so it lives here
export const busyAuthorsDb = pgView('busy_authors').as((qb) =>
  qb.select({authorId: postsDb.authorId, views: postsDb.views}).from(postsDb).where(gt(postsDb.views, 100))
);

export const usersRelations = relations(usersDb, ({many}) => ({posts: many(postsDb)}));
export const postsRelations = relations(postsDb, ({one}) => ({
  author: one(usersDb, {fields: [postsDb.authorId], references: [usersDb.id]}),
}));

export const schema = {users: usersDb, posts: postsDb, usersRelations, postsRelations};

export const db = drizzle(answer, {schema});
