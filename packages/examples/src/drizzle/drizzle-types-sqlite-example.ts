// The SQLite notes table as a pure type: the twin of
// drizzle-proxy-sqlite-example.ts. Text length reaches the validators, integer
// modes map to the right formats (timestamp mode hydrates real Dates).
import * as DZ from '@mionjs/drizzle-orm-sqlite-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {createValidateFn} from '@mionjs/run-types';

export type NotesTable = DZ.SqliteTable<
  'notes',
  {
    id: DZ.Integer<'id', {primaryKey: true}>;
    title: DZ.Text<'title', {length: 80; notNull: true}>;
    rating: DZ.Real<'rating', {notNull: true}>;
    createdAt: DZ.Integer<'created_at', {mode: 'timestamp'; notNull: true}>;
  }
>;

// The recorded table back from the type: toDrizzle works on it unchanged.
export const notes = DZ.tableFromType<NotesTable>();

export type Note = InferSelectModel<NotesTable>;

export const validateNote = createValidateFn<Note>();

// false: title is longer than the captured 80 char limit
export const check = validateNote({id: 1, title: 'x'.repeat(81), rating: 4.5, createdAt: new Date()});
