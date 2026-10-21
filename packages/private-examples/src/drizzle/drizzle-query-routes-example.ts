import {eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/pg-proxy';
import {createMionRouter} from '@mionjs/router';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import {schema} from './drizzle-relations-example.ts';
import {
  authors,
  posts,
  type Author,
  type Post,
  type AuthorWithPosts,
} from './drizzle-relations-schema-example.ts';

const authorsDb = toDrizzle(authors);
const postsDb = toDrizzle(posts);
const db = drizzle(async () => ({rows: []}), {schema});

const mion = createMionRouter();

export const blogApi = mion.initRoutes({
  // whole rows
  listAuthors: mion.route(
    async (): Promise<Author[]> => db.select().from(authorsDb)
  ),

  // selected model fields
  authorNames: mion.route(
    async (): Promise<Pick<Author, 'id' | 'name'>[]> =>
      db.select({id: authorsDb.id, name: authorsDb.name}).from(authorsDb)
  ),

  // one model per joined table
  postsWithAuthor: mion.route(
    async (): Promise<{post: Post; author: Author}[]> =>
      db
        .select({post: postsDb, author: authorsDb})
        .from(postsDb)
        .innerJoin(authorsDb, eq(postsDb.authorId, authorsDb.id))
  ),

  // nested models
  authorsWithPosts: mion.route(
    async (): Promise<AuthorWithPosts[]> =>
      db.query.authors.findMany({with: {posts: true}})
  ),
});
