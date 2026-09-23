import * as DZ from '@mionjs/drizzle-orm-sqlite-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {createValidateFn} from '@mionjs/run-types';

export type NotesTable = DZ.SqliteTable<
  'notes',
  {
    id: DZ.Integer<'id', {primaryKey: true}>;
    title: DZ.Text<'title', {length: 80; notNull: true}>;
    rating: DZ.Real<'rating', {notNull: true}>;
    createdAt: DZ.Integer<'created_at', {mode: 'timestamp'; notNull: true}>; // a real Date
  }
>;

// the recorded table, ready for toDrizzle
export const notes = DZ.tableFromType<NotesTable>();

export type Note = InferSelectModel<NotesTable>;

export const validateNote = createValidateFn<Note>();

// false: title is longer than the captured 80 char limit
export const check = validateNote({
  id: 1,
  title: 'x'.repeat(81),
  rating: 4.5,
  createdAt: new Date(),
});
