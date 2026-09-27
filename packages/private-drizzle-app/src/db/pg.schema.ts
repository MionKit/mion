import * as DZ from '@mionjs/drizzle-orm-pg-core';
import {sql, tableRef} from '@mionjs/drizzle-orm';
import type {InferInsertModel, InferSelectModel, InferSelectViewModel} from '@mionjs/drizzle-orm';

// Builder tables: no drizzle types in this file.

export const users = DZ.pgTable('users', {
  id: DZ.uuid('id', {defaultRandom: true, primaryKey: true}),
  name: DZ.varchar('name', {length: 100, notNull: true}),
  email: DZ.varchar('email', {length: 255, notNull: true}),
  age: DZ.integer('age', {notNull: true}),
  role: DZ.text('role', {enum: ['admin', 'user'], notNull: true}),
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

// a view with explicit columns: its row keeps the same formats as a table
export const adultUsers = DZ.pgView('adult_users', {
  id: DZ.uuid('id', {notNull: true}),
  name: DZ.varchar('name', {length: 100, notNull: true}),
  age: DZ.integer('age', {notNull: true}),
}).as(sql`select id, name, age from ${users} where age >= 18`);

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Post = InferSelectModel<typeof posts>;
export type AdultUser = InferSelectViewModel<typeof adultUsers>;
