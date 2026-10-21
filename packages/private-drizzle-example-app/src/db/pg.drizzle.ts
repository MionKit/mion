import {drizzle} from 'drizzle-orm/pg-proxy';
import {gt, relations, sql} from 'drizzle-orm';
import {bigint, boolean, integer, pgTable, pgView, text, timestamp, uuid, varchar} from 'drizzle-orm/pg-core';
import {answer} from './fakeDriver.ts';

// Plain drizzle twin of pg.builders.ts: every type comes from drizzle.

export const usersDb = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', {length: 100}).notNull(),
  email: varchar('email', {length: 255}).notNull(),
  age: integer('age').notNull(),
  role: text('role', {enum: ['admin', 'user']}).notNull(),
  active: boolean('active').notNull(),
  balance: bigint('balance', {mode: 'bigint'}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const postsDb = pgTable('posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  authorId: uuid('author_id')
    .notNull()
    .references(() => usersDb.id),
  title: varchar('title', {length: 200}).notNull(),
  tags: text('tags').array().notNull(),
  views: integer('views').notNull().default(0),
  publishedAt: timestamp('published_at'),
});

export const adultUsersDb = pgView('adult_users', {
  id: uuid('id').notNull(),
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
}).as(sql`select id, name, age from ${usersDb} where age >= 18`);

export const busyAuthorsDb = pgView('busy_authors').as((qb) =>
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
