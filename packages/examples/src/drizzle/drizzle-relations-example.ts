// Relations are the clearest case of the boundary. They emit no SQL and create
// no foreign keys: they exist so drizzle's query builder can nest your results.
// So they are declared with drizzle, on the toDrizzle() tables, in the file
// that runs your queries. Your schema file stays free of drizzle types.
import * as DB from '@mionjs/drizzle-orm-pg-core';
import {cols} from '@mionjs/drizzle-orm';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {relations} from 'drizzle-orm';
import type {ExtractTablesWithRelations} from 'drizzle-orm';
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core';

// ── the schema: slim, no drizzle types ───────────────────────────────────────

export const authors = DB.pgTable('authors', {
  id: DB.uuid('id').defaultRandom().primaryKey(),
  name: DB.varchar('name', {length: 100}).notNull(),
});

export const posts = DB.pgTable('posts', {
  id: DB.uuid('id').defaultRandom().primaryKey(),
  authorId: DB.uuid('author_id')
    .notNull()
    .references(() => cols(authors).id, {onDelete: 'cascade'}),
  title: DB.varchar('title', {length: 200}).notNull(),
});

// These are the types your routes and your client use. They know nothing about
// relations, and nothing about drizzle.
export type Author = InferSelectModel<typeof authors>;
export type Post = InferSelectModel<typeof posts>;

// ── the query side: drizzle, over the materialized tables ────────────────────

const authorsDb = toDrizzle(authors);
const postsDb = toDrizzle(posts);

// relations() takes the REAL drizzle tables, which is why this lives here and
// not in the schema file above.
const authorsRelations = relations(authorsDb, ({many}) => ({
  posts: many(postsDb),
}));
const postsRelations = relations(postsDb, ({one}) => ({
  author: one(authorsDb, {fields: [postsDb.authorId], references: [authorsDb.id]}),
}));

// The schema object you hand to drizzle(client, {schema}).
export const schema = {
  authors: authorsDb,
  posts: postsDb,
  authorsRelations,
  postsRelations,
};

declare const db: PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

// Nested reads work exactly as they do in plain drizzle.
export async function authorsWithPosts() {
  return db.query.authors.findMany({with: {posts: true}});
}

// If you want that nested shape in a route or on the client, build it from the
// slim models rather than from drizzle's inferred query type: these are the
// types that cross your API without dragging drizzle along.
export interface AuthorWithPosts extends Author {
  posts: Post[];
}
