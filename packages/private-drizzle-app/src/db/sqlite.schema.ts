import * as DZ from '@mionjs/drizzle-orm-sqlite-core';
import {$type, sql, tableRef} from '@mionjs/drizzle-orm';
import type {InferInsertModel, InferSelectModel, InferSelectViewModel, InferUpdateModel} from '@mionjs/drizzle-orm';

// Builder tables: no drizzle types in this file. sqlite stores dates and booleans as integers, json as text.

export const users = DZ.sqliteTable('users', {
  id: DZ.text('id', {primaryKey: true}),
  name: DZ.text('name', {length: 100, notNull: true}),
  email: DZ.text('email', {length: 255, notNull: true}),
  age: DZ.integer('age', {notNull: true}),
  role: DZ.text('role', {enum: ['admin', 'user'], notNull: true}),
  active: DZ.integer('active', {mode: 'boolean', notNull: true}),
  balance: DZ.blob('balance', {mode: 'bigint', notNull: true}),
  createdAt: DZ.integer('created_at', {mode: 'timestamp', notNull: true}),
});

export const posts = DZ.sqliteTable('posts', {
  id: DZ.text('id', {primaryKey: true}),
  authorId: DZ.text('author_id', {notNull: true, references: [() => tableRef(users, 'id')]}),
  title: DZ.text('title', {length: 200, notNull: true}),
  tags: DZ.text('tags', {mode: 'json', $type: $type<string[]>(), notNull: true}),
  views: DZ.integer('views', {notNull: true, default: [0]}),
  publishedAt: DZ.integer('published_at', {mode: 'timestamp'}),
});

export const adultUsers = DZ.sqliteView('adult_users', {
  id: DZ.text('id', {notNull: true}),
  name: DZ.text('name', {length: 100, notNull: true}),
  age: DZ.integer('age', {notNull: true}),
}).as(sql`select id, name, age from ${users} where age >= 18`);

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type UserPatch = InferUpdateModel<typeof users>;
export type Post = InferSelectModel<typeof posts>;
export type AdultUser = InferSelectViewModel<typeof adultUsers>;
