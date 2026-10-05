// MySQL on slim builders: slim tables and public model types.
import * as DZ from '@mionjs/drizzle-orm-mysql-core';
import {$type, sql, tableRef} from '@mionjs/drizzle-orm';

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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserPatch = Partial<typeof users.$inferInsert>;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type PostPatch = Partial<typeof posts.$inferInsert>;
// A query-builder view has no slim model, so its row type is written by hand.
export type BusyAuthor = Pick<Post, 'authorId' | 'views'>;
export type AdultUser = typeof adultUsers.$inferSelect;
