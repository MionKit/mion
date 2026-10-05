import * as DZ from '@mionjs/drizzle-orm-pg-core';
import {tableRef, type InferSelectModel} from '@mionjs/drizzle-orm';

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

// start-nested-model
export interface AuthorWithPosts extends Author {
  posts: Post[];
}
// end-nested-model
