import {authors, posts} from './drizzle-relations-schema-example.ts';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import {relations} from 'drizzle-orm';
import type {ExtractTablesWithRelations} from 'drizzle-orm';
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core';

const authorsDb = toDrizzle(authors);
const postsDb = toDrizzle(posts);

// relations need real Drizzle tables
const authorsRelations = relations(authorsDb, ({many}) => ({
  posts: many(postsDb),
}));
const postsRelations = relations(postsDb, ({one}) => ({
  author: one(authorsDb, {
    fields: [postsDb.authorId],
    references: [authorsDb.id],
  }),
}));

// passed to drizzle(client, {schema})
export const schema = {
  authors: authorsDb,
  posts: postsDb,
  authorsRelations,
  postsRelations,
};

declare const db: PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

// nested results
export async function authorsWithPosts() {
  return db.query.authors.findMany({with: {posts: true}});
}
