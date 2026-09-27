import {avg, count, eq, sql} from 'drizzle-orm';
import {mion} from './mion.ts';
import {adultUsersDb, busyAuthorsDb, db, postsDb, usersDb} from '../db/pg.db.ts';
import type {AdultUser, NewUser, Post, User} from '../db/pg.schema.ts';

// The same queries as pg.routes.ts, each route writing its return type from the slim models.
// The `case:` markers below split the file for the per-case cost measure.

export const pgTypedRoutes = {
  // case: selectAll
  listUsers: mion.route(async (): Promise<User[]> => db.select().from(usersDb)),

  // case: partialSelect
  userNames: mion.route(
    async (): Promise<Pick<User, 'id' | 'name'>[]> => db.select({id: usersDb.id, name: usersDb.name}).from(usersDb)
  ),

  // case: innerJoin
  postsWithAuthor: mion.route(
    async (): Promise<{post: Post; author: Pick<User, 'id' | 'name'>}[]> =>
      db
        .select({post: postsDb, author: {id: usersDb.id, name: usersDb.name}})
        .from(postsDb)
        .innerJoin(usersDb, eq(postsDb.authorId, usersDb.id))
  ),

  // case: leftJoin
  usersAndPosts: mion.route(
    async (): Promise<{users: User; posts: Post | null}[]> =>
      db.select().from(usersDb).leftJoin(postsDb, eq(postsDb.authorId, usersDb.id))
  ),

  // case: aggregate
  roleStats: mion.route(
    async (): Promise<{role: User['role']; total: number; avgAge: string | null; maxAge: number}[]> =>
      db
        .select({role: usersDb.role, total: count(), avgAge: avg(usersDb.age), maxAge: sql<number>`max(${usersDb.age})`})
        .from(usersDb)
        .groupBy(usersDb.role)
  ),

  // case: insertReturning
  createUser: mion.route(async (_ctx, user: NewUser): Promise<User> => {
    const [row] = await db.insert(usersDb).values(user).returning();
    return row;
  }),

  // case: updateReturning
  renameUser: mion.route(async (_ctx, id: string, name: string): Promise<Pick<User, 'id' | 'name'>> => {
    const [row] = await db.update(usersDb).set({name}).where(eq(usersDb.id, id)).returning({id: usersDb.id, name: usersDb.name});
    return row;
  }),

  // case: relations
  usersWithPosts: mion.route(async (): Promise<(User & {posts: Post[]})[]> => db.query.users.findMany({with: {posts: true}})),

  // case: viewColumns
  adults: mion.route(async (): Promise<AdultUser[]> => db.select().from(adultUsersDb)),

  // case: viewQueryBuilder
  busyAuthors: mion.route(async (): Promise<Pick<Post, 'authorId' | 'views'>[]> => db.select().from(busyAuthorsDb)),

  // case: mappedShape
  authorCards: mion.route(
    async (): Promise<
      {author: {id: User['id']; name: User['name']; since: User['createdAt']}; postCount: number; titles: Post['title'][]}[]
    > => {
      const rows = await db.query.users.findMany({with: {posts: true}});
      return rows.map((user) => ({
        author: {id: user.id, name: user.name, since: user.createdAt},
        postCount: user.posts.length,
        titles: user.posts.map((post) => post.title),
      }));
    }
  ),
};
