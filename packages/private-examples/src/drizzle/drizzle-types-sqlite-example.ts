import * as DZ from '@mionjs/drizzle-orm-sqlite-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {createValidateFn} from '@mionjs/run-types';

export type NotesTable = DZ.SqliteTable<'notes', {
    id: DZ.Integer<{primaryKey: true}>;
    title: DZ.Text<{length: 80; notNull: true}>;
    rating: DZ.Real<{notNull: true}>;
    createdAt: DZ.Integer<{mode: 'timestamp'; notNull: true}>; // a real Date
  }, [], {createdAt: 'created_at'}>;

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
