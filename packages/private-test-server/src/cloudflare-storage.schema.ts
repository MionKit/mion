import {integer, sqliteTable, text} from '@mionjs/drizzle-orm-sqlite-core';
import {refineTableType} from '@mionjs/drizzle-orm';
import type {InferInsertModel, InferSelectModel} from '@mionjs/drizzle-orm';

const notesTable = sqliteTable('notes', {
  id: integer('id', {primaryKey: [{autoIncrement: true}]}),
  title: text('title', {length: 120, notNull: true}),
  // Its model is a Date, the interesting half of the round trip.
  createdAt: integer('created_at', {mode: 'timestamp', notNull: true}),
});
export const apiNotes = refineTableType(notesTable, {title: {minLength: 3}});

export type Note = InferSelectModel<typeof apiNotes>;
export type NewNote = InferInsertModel<typeof apiNotes>;
