import {drizzle} from 'drizzle-orm/sqlite-proxy';
import {gt, relations} from 'drizzle-orm';
import {sqliteView} from 'drizzle-orm/sqlite-core';
import {toDrizzle} from '@mionjs/drizzle-orm-sqlite-core/drizzle';
import {answer} from './fakeDriver.ts';
import {users, adultUsers} from './sqlite.types.ts';
import type {UsersTable, PostsTable} from './sqlite.types.ts';

export const usersDb = toDrizzle<UsersTable>();
export const postsDb = toDrizzle<PostsTable>({tables: {users}});
export const adultUsersDb = toDrizzle(adultUsers);

// Query-builder views require drizzle (drizzle-migrate-query-builder-view).
export const busyAuthorsDb = sqliteView('busy_authors').as((qb) =>
  qb.select({authorId: postsDb.authorId, views: postsDb.views}).from(postsDb).where(gt(postsDb.views, 100))
);

export const usersRelations = relations(usersDb, ({many}) => ({posts: many(postsDb)}));
export const postsRelations = relations(postsDb, ({one}) => ({
  author: one(usersDb, {fields: [postsDb.authorId], references: [usersDb.id]}),
}));

export const schema = {users: usersDb, posts: postsDb, usersRelations, postsRelations};

export const db = drizzle(answer, {schema});
