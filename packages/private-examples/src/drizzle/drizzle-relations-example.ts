import * as DZ from '@mionjs/drizzle-orm-pg-core';
import {tableRef} from '@mionjs/drizzle-orm';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {relations} from 'drizzle-orm';
import type {ExtractTablesWithRelations} from 'drizzle-orm';
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core';

// the schema: no drizzle types

export const authors = DZ.pgTable('authors', {
  id: DZ.uuid('id', {defaultRandom: true, primaryKey: true}),
  name: DZ.varchar('name', {length: 100, notNull: true}),
});

export const posts = DZ.pgTable('posts', {
  id: DZ.uuid('id', {defaultRandom: true, primaryKey: true}),
  authorId: DZ.uuid('author_id', {
    notNull: true,
    references: [() => tableRef(authors, 'id'), {onDelete: 'cascade'}],
  }),
  title: DZ.varchar('title', {length: 200, notNull: true}),
});

// the types your routes and your client use
export type Author = InferSelectModel<typeof authors>;
export type Post = InferSelectModel<typeof posts>;

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

export interface AuthorWithPosts extends Author {
  posts: Post[];
}
