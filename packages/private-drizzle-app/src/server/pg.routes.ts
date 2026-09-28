/* eslint-disable @mionjs/strong-typed-routes -- this file is the inferred-return side of the comparison */
import {avg, count, eq, sql} from 'drizzle-orm';
import {mion} from './mion.ts';
import {adultUsersDb, busyAuthorsDb, db, postsDb, usersDb} from '../db/pg.db.ts';
import type {NewUser} from '../db/pg.schema.ts';

// Written as a drizzle user would: no return annotation.
// The `case:` markers below split the file for the per-case cost measure.

export const pgRoutes = {
  // case: selectAll
  listUsers: mion.route(async () => db.select().from(usersDb)),

  // case: partialSelect
  userNames: mion.route(async () => db.select({id: usersDb.id, name: usersDb.name}).from(usersDb)),

  // case: innerJoin
  postsWithAuthor: mion.route(async () =>
    db
      .select({post: postsDb, author: {id: usersDb.id, name: usersDb.name}})
      .from(postsDb)
      .innerJoin(usersDb, eq(postsDb.authorId, usersDb.id))
  ),

  // case: leftJoin
  usersAndPosts: mion.route(async () => db.select().from(usersDb).leftJoin(postsDb, eq(postsDb.authorId, usersDb.id))),

  // case: aggregate
  roleStats: mion.route(async () =>
    db
      .select({role: usersDb.role, total: count(), avgAge: avg(usersDb.age), maxAge: sql<number>`max(${usersDb.age})`})
      .from(usersDb)
      .groupBy(usersDb.role)
  ),

  // case: insertReturning
  createUser: mion.route(async (_ctx, user: NewUser) => {
    const [row] = await db.insert(usersDb).values(user).returning();
    return row;
  }),

  // case: updateReturning
  renameUser: mion.route(async (_ctx, id: string, name: string) => {
    const [row] = await db.update(usersDb).set({name}).where(eq(usersDb.id, id)).returning({id: usersDb.id, name: usersDb.name});
    return row;
  }),

  // case: relations
  usersWithPosts: mion.route(async () => db.query.users.findMany({with: {posts: true}})),

  // case: viewColumns
  adults: mion.route(async () => db.select().from(adultUsersDb)),

  // case: viewQueryBuilder
  busyAuthors: mion.route(async () => db.select().from(busyAuthorsDb)),

  // case: mappedShape
  authorCards: mion.route(async () => {
    const rows = await db.query.users.findMany({with: {posts: true}});
    return rows.map((user) => ({
      author: {id: user.id, name: user.name, since: user.createdAt},
      postCount: user.posts.length,
      titles: user.posts.map((post) => post.title),
    }));
  }),
};
