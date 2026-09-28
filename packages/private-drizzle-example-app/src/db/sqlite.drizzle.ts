import {drizzle} from 'drizzle-orm/sqlite-proxy';
import {gt, relations, sql} from 'drizzle-orm';
import {blob, integer, sqliteTable, sqliteView, text} from 'drizzle-orm/sqlite-core';
import {answer} from './fakeDriver.ts';

// Plain drizzle twin of sqlite.builders.ts: every type comes from drizzle.

export const usersDb = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name', {length: 100}).notNull(),
  email: text('email', {length: 255}).notNull(),
  age: integer('age').notNull(),
  role: text('role', {enum: ['admin', 'user']}).notNull(),
  active: integer('active', {mode: 'boolean'}).notNull(),
  balance: blob('balance', {mode: 'bigint'}).notNull(),
  createdAt: integer('created_at', {mode: 'timestamp'}).notNull(),
});

export const postsDb = sqliteTable('posts', {
  id: text('id').primaryKey(),
  authorId: text('author_id')
    .notNull()
    .references(() => usersDb.id),
  title: text('title', {length: 200}).notNull(),
  tags: text('tags', {mode: 'json'}).$type<string[]>().notNull(),
  views: integer('views').notNull().default(0),
  publishedAt: integer('published_at', {mode: 'timestamp'}),
});

export const adultUsersDb = sqliteView('adult_users', {
  id: text('id').notNull(),
  name: text('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
}).as(sql`select id, name, age from ${usersDb} where age >= 18`);

export const busyAuthorsDb = sqliteView('busy_authors').as((qb) =>
  qb.select({authorId: postsDb.authorId, views: postsDb.views}).from(postsDb).where(gt(postsDb.views, 100))
);

export const usersRelations = relations(usersDb, ({many}) => ({posts: many(postsDb)}));
export const postsRelations = relations(postsDb, ({one}) => ({
  author: one(usersDb, {fields: [postsDb.authorId], references: [usersDb.id]}),
}));

export const schema = {users: usersDb, posts: postsDb, usersRelations, postsRelations};

export const db = drizzle(answer, {schema});

export type User = typeof usersDb.$inferSelect;
export type NewUser = typeof usersDb.$inferInsert;
export type UserPatch = Partial<NewUser>;
export type Post = typeof postsDb.$inferSelect;
export type NewPost = typeof postsDb.$inferInsert;
export type PostPatch = Partial<NewPost>;
export type AdultUser = typeof adultUsersDb.$inferSelect;
export type BusyAuthor = typeof busyAuthorsDb.$inferSelect;
