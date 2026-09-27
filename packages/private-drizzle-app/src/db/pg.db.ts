import {drizzle} from 'drizzle-orm/pg-proxy';
import {relations} from 'drizzle-orm';
import {pgView} from 'drizzle-orm/pg-core';
import {gt} from 'drizzle-orm';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import {adultUsers, posts, users} from './pg.schema.ts';
import {answer} from './fakeDriver.ts';

// The query side: the only place drizzle's types load.

export const usersDb = toDrizzle(users);
export const postsDb = toDrizzle(posts);
export const adultUsersDb = toDrizzle(adultUsers);

// a view built from a query builder stays on drizzle (DRZ001), so it lives here
export const busyAuthorsDb = pgView('busy_authors').as((qb) =>
  qb.select({authorId: postsDb.authorId, views: postsDb.views}).from(postsDb).where(gt(postsDb.views, 100))
);

export const usersRelations = relations(usersDb, ({many}) => ({posts: many(postsDb)}));
export const postsRelations = relations(postsDb, ({one}) => ({
  author: one(usersDb, {fields: [postsDb.authorId], references: [usersDb.id]}),
}));

export const schema = {users: usersDb, posts: postsDb, usersRelations, postsRelations};

export const db = drizzle(answer, {schema});
