// SQLite proxy builders: text length reaches the validators, integer modes map
// to the right formats (timestamp mode hydrates real Dates).
import {sqliteTable, integer, text, real} from '@mionjs/drizzle-orm-sqlite-core';
import type {InferSelectModel} from 'drizzle-orm';
import {createValidateFn} from '@ts-runtypes/core';

export const notes = sqliteTable('notes', {
  id: integer('id').primaryKey(),
  title: text('title', {length: 80}).notNull(),
  rating: real('rating').notNull(),
  createdAt: integer('created_at', {mode: 'timestamp'}).notNull(),
});

export type Note = InferSelectModel<typeof notes>;

export const validateNote = createValidateFn<Note>();

// false: title is longer than the captured 80 char limit
export const check = validateNote({id: 1, title: 'x'.repeat(81), rating: 4.5, createdAt: new Date()});
