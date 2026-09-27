import * as DZ from '@mionjs/drizzle-orm-sqlite-core';
import type {InferInsertModel, InferSelectModel} from '@mionjs/drizzle-orm';

// Only the columns sqlite stores differently: dates and booleans as integers, json as text.
export const notes = DZ.sqliteTable('notes', {
  id: DZ.integer('id', {primaryKey: true}),
  title: DZ.text('title', {length: 80, notNull: true}),
  done: DZ.integer('done', {mode: 'boolean', notNull: true}),
  meta: DZ.text('meta', {mode: 'json'}),
  rating: DZ.real('rating', {notNull: true}),
  createdAt: DZ.integer('created_at', {mode: 'timestamp', notNull: true}),
});

export type Note = InferSelectModel<typeof notes>;
export type NewNote = InferInsertModel<typeof notes>;
