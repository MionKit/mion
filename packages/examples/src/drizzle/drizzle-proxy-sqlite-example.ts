// SQLite recorder builders: text length reaches the validators, integer modes
// map to the right formats (timestamp mode hydrates real Dates).
import * as DZ from '@mionjs/drizzle-orm-sqlite-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {createValidateFn} from '@mionjs/run-types';

// A recorded table, NOT drizzle's SQLiteTable type: toDrizzle() builds that on demand.
export const notes = DZ.sqliteTable('notes', {
  id: DZ.integer('id').primaryKey(),
  title: DZ.text('title', {length: 80}).notNull(),
  rating: DZ.real('rating').notNull(),
  createdAt: DZ.integer('created_at', {mode: 'timestamp'}).notNull(),
});

export type Note = InferSelectModel<typeof notes>;

export const validateNote = createValidateFn<Note>();

// false: title is longer than the captured 80 char limit
export const check = validateNote({id: 1, title: 'x'.repeat(81), rating: 4.5, createdAt: new Date()});
