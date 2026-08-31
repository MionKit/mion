// The SQLite notes table as a pure type: the twin of
// drizzle-proxy-sqlite-example.ts. Text length reaches the validators, integer
// modes map to the right formats (timestamp mode hydrates real Dates).
import * as DB from '@mionjs/drizzle-orm-sqlite-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {createValidateFn} from '@mionjs/run-types';

export type NotesTable = DB.SqliteTable<
  'notes',
  {
    id: DB.Integer<'id', {primaryKey: true}>;
    title: DB.Text<'title', {length: 80; notNull: true}>;
    rating: DB.Real<'rating', {notNull: true}>;
    createdAt: DB.Integer<'created_at', {mode: 'timestamp'; notNull: true}>;
  }
>;

// The recorded table back from the type: toDrizzle works on it unchanged.
export const notes = DB.tableFromType<NotesTable>();

export type Note = InferSelectModel<NotesTable>;

export const validateNote = createValidateFn<Note>();

// false: title is longer than the captured 80 char limit
export const check = validateNote({id: 1, title: 'x'.repeat(81), rating: 4.5, createdAt: new Date()});
