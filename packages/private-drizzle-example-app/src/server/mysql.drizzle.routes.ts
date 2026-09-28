/* @mion-expect-error MRT001 */
// The return types are left to drizzle on purpose.
import {avg, count, eq, gte, sql} from 'drizzle-orm';
import {mion} from './mion.ts';
import {adultUsersDb, busyAuthorsDb, db, postsDb, usersDb} from '../db/mysql.drizzle.ts';
import type {NewUser, User, UserPatch} from '../db/mysql.drizzle.ts';

// The builders routes on plain drizzle: params typed with drizzle's types, return types left to drizzle.
// The `case:` markers name each route for the cost test.
// mysql has no `returning`, so a write reads its row back with a select.

export const mysqlDrizzleRoutes = {
  // case: selectAll
  listUsers: mion.route(async (_ctx, minAge: User['age']) => db.select().from(usersDb).where(gte(usersDb.age, minAge))),

  // case: partialSelect
  userNames: mion.route(async (_ctx, role: User['role']) =>
    db.select({id: usersDb.id, name: usersDb.name}).from(usersDb).where(eq(usersDb.role, role))
  ),

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
    await db.insert(usersDb).values(user);
    const [row] = await db.select().from(usersDb).where(eq(usersDb.id, user.id));
    return row;
  }),

  // case: updateReturning
  renameUser: mion.route(async (_ctx, id: User['id'], patch: UserPatch) => {
    await db.update(usersDb).set(patch).where(eq(usersDb.id, id));
    const [row] = await db.select({id: usersDb.id, name: usersDb.name}).from(usersDb).where(eq(usersDb.id, id));
    return row;
  }),

  // case: relations
  usersWithPosts: mion.route(async () => db.query.users.findMany({with: {posts: true}})),

  // case: viewColumns
  adults: mion.route(async () => db.select().from(adultUsersDb)),

  // case: viewQueryBuilder
  busyAuthors: mion.route(async () => db.select().from(busyAuthorsDb)),

  // case: transaction
  moveBalance: mion.route(async (_ctx, fromId: User['id'], toId: User['id'], amount: User['balance']) =>
    db.transaction(async (tx) => {
      await tx
        .update(usersDb)
        .set({balance: sql`${usersDb.balance} - ${amount}`})
        .where(eq(usersDb.id, fromId));
      await tx
        .update(usersDb)
        .set({balance: sql`${usersDb.balance} + ${amount}`})
        .where(eq(usersDb.id, toId));
      const [from] = await tx.select({id: usersDb.id, balance: usersDb.balance}).from(usersDb).where(eq(usersDb.id, fromId));
      const [to] = await tx.select({id: usersDb.id, balance: usersDb.balance}).from(usersDb).where(eq(usersDb.id, toId));
      return {from, to};
    })
  ),

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
