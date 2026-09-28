import * as DZ from '@mionjs/drizzle-orm-mysql-core';
import {$type, sql, tableRef} from '@mionjs/drizzle-orm';
import type {InferInsertModel, InferSelectModel, InferSelectViewModel, InferUpdateModel} from '@mionjs/drizzle-orm';

// Builder tables: no drizzle types in this file.

export const users = DZ.mysqlTable('users', {
  id: DZ.varchar('id', {length: 36, primaryKey: true}),
  name: DZ.varchar('name', {length: 100, notNull: true}),
  email: DZ.varchar('email', {length: 255, notNull: true}),
  age: DZ.int('age', {notNull: true}),
  role: DZ.varchar('role', {length: 10, enum: ['admin', 'user'], notNull: true}),
  active: DZ.boolean('active', {notNull: true}),
  balance: DZ.bigint('balance', {mode: 'bigint', notNull: true}),
  createdAt: DZ.timestamp('created_at', {defaultNow: true, notNull: true}),
});

export const posts = DZ.mysqlTable('posts', {
  id: DZ.varchar('id', {length: 36, primaryKey: true}),
  authorId: DZ.varchar('author_id', {length: 36, notNull: true, references: [() => tableRef(users, 'id')]}),
  title: DZ.varchar('title', {length: 200, notNull: true}),
  tags: DZ.json('tags', {$type: $type<string[]>(), notNull: true}),
  views: DZ.int('views', {notNull: true, default: [0]}),
  publishedAt: DZ.timestamp('published_at'),
});

export const adultUsers = DZ.mysqlView('adult_users', {
  id: DZ.varchar('id', {length: 36, notNull: true}),
  name: DZ.varchar('name', {length: 100, notNull: true}),
  age: DZ.int('age', {notNull: true}),
}).as(sql`select id, name, age from ${users} where age >= 18`);

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type UserPatch = InferUpdateModel<typeof users>;
export type Post = InferSelectModel<typeof posts>;
export type AdultUser = InferSelectViewModel<typeof adultUsers>;
