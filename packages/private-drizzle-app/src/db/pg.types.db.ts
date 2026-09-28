import {drizzle} from 'drizzle-orm/pg-proxy';
import {gt, relations} from 'drizzle-orm';
import {pgView} from 'drizzle-orm/pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import {adultUsers, type PostsTable, type UsersTable} from './pg.types.schema.ts';
import {answer} from './fakeDriver.ts';

// The type-form twin of pg.db.ts.

export const usersDb = toDrizzle<UsersTable>();
export const postsDb = toDrizzle<PostsTable>();
export const adultUsersDb = toDrizzle(adultUsers);

export const busyAuthorsDb = pgView('busy_authors').as((qb) =>
  qb.select({authorId: postsDb.authorId, views: postsDb.views}).from(postsDb).where(gt(postsDb.views, 100))
);

export const usersRelations = relations(usersDb, ({many}) => ({posts: many(postsDb)}));
export const postsRelations = relations(postsDb, ({one}) => ({
  author: one(usersDb, {fields: [postsDb.authorId], references: [usersDb.id]}),
}));

export const schema = {users: usersDb, posts: postsDb, usersRelations, postsRelations};

export const db = drizzle(answer, {schema});
