// The type-form twin of mysql.db.ts.
import {drizzle} from 'drizzle-orm/mysql-proxy';
import {gt, relations} from 'drizzle-orm';
import {mysqlView} from 'drizzle-orm/mysql-core';
import {toDrizzle} from '@mionjs/drizzle-orm-mysql-core/drizzle';
import {adultUsers, type PostsTable, type UsersTable} from './mysql.types.schema.ts';
import {answer} from './fakeDriver.ts';

export const usersDb = toDrizzle<UsersTable>();
export const postsDb = toDrizzle<PostsTable>();
export const adultUsersDb = toDrizzle(adultUsers);

// a view built from a query builder stays on drizzle (DRZ001), so it lives here
export const busyAuthorsDb = mysqlView('busy_authors').as((qb) =>
  qb.select({authorId: postsDb.authorId, views: postsDb.views}).from(postsDb).where(gt(postsDb.views, 100))
);

export const usersRelations = relations(usersDb, ({many}) => ({posts: many(postsDb)}));
export const postsRelations = relations(postsDb, ({one}) => ({
  author: one(usersDb, {fields: [postsDb.authorId], references: [usersDb.id]}),
}));

export const schema = {users: usersDb, posts: postsDb, usersRelations, postsRelations};

export const db = drizzle(answer, {schema});
