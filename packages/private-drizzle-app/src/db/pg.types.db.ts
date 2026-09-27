import {drizzle} from 'drizzle-orm/pg-proxy';
import {relations} from 'drizzle-orm';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import type {PostsTable, UsersTable} from './pg.types.schema.ts';
import {answer} from './fakeDriver.ts';

// The type-form twin of pg.db.ts: the marker form of toDrizzle, no builder call anywhere.

export const usersDb = toDrizzle<UsersTable>();
export const postsDb = toDrizzle<PostsTable>();

export const usersRelations = relations(usersDb, ({many}) => ({posts: many(postsDb)}));
export const postsRelations = relations(postsDb, ({one}) => ({
  author: one(usersDb, {fields: [postsDb.authorId], references: [usersDb.id]}),
}));

export const schema = {users: usersDb, posts: postsDb, usersRelations, postsRelations};

export const db = drizzle(answer, {schema});
