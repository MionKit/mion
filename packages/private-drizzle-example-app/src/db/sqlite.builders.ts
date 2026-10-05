// SQLite on slim builders: slim tables and public model types.
import * as DZ from '@mionjs/drizzle-orm-sqlite-core';
import {$type, sql, tableRef} from '@mionjs/drizzle-orm';

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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserPatch = Partial<typeof users.$inferInsert>;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type PostPatch = Partial<typeof posts.$inferInsert>;
// A query-builder view has no slim model, so its row type is written by hand.
export type BusyAuthor = Pick<Post, 'authorId' | 'views'>;
export type AdultUser = typeof adultUsers.$inferSelect;
