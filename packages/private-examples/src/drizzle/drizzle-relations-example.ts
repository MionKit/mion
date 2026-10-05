import {authors, posts} from './drizzle-relations-schema-example.ts';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import {relations} from 'drizzle-orm';
import type {ExtractTablesWithRelations} from 'drizzle-orm';
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core';

// the query side: drizzle, over the materialized tables

const authorsDb = toDrizzle(authors);
const postsDb = toDrizzle(posts);

// relations() takes the real drizzle tables, so it lives here
const authorsRelations = relations(authorsDb, ({many}) => ({
  posts: many(postsDb),
}));
const postsRelations = relations(postsDb, ({one}) => ({
  author: one(authorsDb, {
    fields: [postsDb.authorId],
    references: [authorsDb.id],
  }),
}));

// what you pass to drizzle(client, {schema})
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

// nested reads work as in plain drizzle
export async function authorsWithPosts() {
  return db.query.authors.findMany({with: {posts: true}});
}
