import {drizzle} from 'drizzle-orm/pg-proxy';
import {gt, relations} from 'drizzle-orm';
import {pgView} from 'drizzle-orm/pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import {answer} from './fakeDriver.ts';
import {users, adultUsers} from './pg.types.ts';
import type {UsersTable, PostsTable} from './pg.types.ts';

export const usersDb = toDrizzle<UsersTable>();
export const postsDb = toDrizzle<PostsTable>({tables: {users}});
export const adultUsersDb = toDrizzle(adultUsers);

// Query-builder views require drizzle (drizzle-migrate-query-builder-view).
export const busyAuthorsDb = pgView('busy_authors').as((qb) =>
  qb.select({authorId: postsDb.authorId, views: postsDb.views}).from(postsDb).where(gt(postsDb.views, 100))
);

export const usersRelations = relations(usersDb, ({many}) => ({posts: many(postsDb)}));
export const postsRelations = relations(postsDb, ({one}) => ({
  author: one(usersDb, {fields: [postsDb.authorId], references: [usersDb.id]}),
}));

export const schema = {users: usersDb, posts: postsDb, usersRelations, postsRelations};

export const db = drizzle(answer, {schema});
