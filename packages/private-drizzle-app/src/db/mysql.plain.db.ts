import {drizzle} from 'drizzle-orm/mysql-proxy';
import {gt, relations, sql} from 'drizzle-orm';
import {bigint, boolean, int, json, mysqlTable, mysqlView, timestamp, varchar} from 'drizzle-orm/mysql-core';
import {answer} from './fakeDriver.ts';

// mysql.schema.ts + mysql.db.ts on plain drizzle.

export const usersDb = mysqlTable('users', {
  id: varchar('id', {length: 36}).primaryKey(),
  name: varchar('name', {length: 100}).notNull(),
  email: varchar('email', {length: 255}).notNull(),
  age: int('age').notNull(),
  role: varchar('role', {length: 10, enum: ['admin', 'user']}).notNull(),
  active: boolean('active').notNull(),
  balance: bigint('balance', {mode: 'bigint'}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const postsDb = mysqlTable('posts', {
  id: varchar('id', {length: 36}).primaryKey(),
  authorId: varchar('author_id', {length: 36})
    .notNull()
    .references(() => usersDb.id),
  title: varchar('title', {length: 200}).notNull(),
  tags: json('tags').$type<string[]>().notNull(),
  views: int('views').notNull().default(0),
  publishedAt: timestamp('published_at'),
});

export const adultUsersDb = mysqlView('adult_users', {
  id: varchar('id', {length: 36}).notNull(),
  name: varchar('name', {length: 100}).notNull(),
  age: int('age').notNull(),
}).as(sql`select id, name, age from ${usersDb} where age >= 18`);

export const busyAuthorsDb = mysqlView('busy_authors').as((qb) =>
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
export type AdultUser = typeof adultUsersDb.$inferSelect;
