import {drizzle} from 'drizzle-orm/sqlite-proxy';
import {integer, real, sqliteTable, text} from 'drizzle-orm/sqlite-core';
import {answer} from './fakeDriver.ts';

// sqlite.schema.ts + sqlite.db.ts on plain drizzle: the cost baseline, never served.

export const notesDb = sqliteTable('notes', {
  id: integer('id').primaryKey(),
  title: text('title', {length: 80}).notNull(),
  done: integer('done', {mode: 'boolean'}).notNull(),
  meta: text('meta', {mode: 'json'}),
  rating: real('rating').notNull(),
  createdAt: integer('created_at', {mode: 'timestamp'}).notNull(),
});

export const db = drizzle(answer);

export type Note = typeof notesDb.$inferSelect;
export type NewNote = typeof notesDb.$inferInsert;
