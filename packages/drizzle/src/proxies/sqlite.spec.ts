/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Runtime pins for the @mionjs/drizzle/sqlite proxy builders: text length,
// the default integer mode and the timestamp mode's Date hydration reach the
// compiled validators; the marker pair and shared-function guarantees hold;
// wrappers build the exact drizzle column.

import {describe, it, expect} from 'vitest';
import type {InferSelectModel} from 'drizzle-orm';
import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
import {text as drizzleText, sqliteTable as drizzleSqliteTable} from 'drizzle-orm/sqlite-core';
import {integer, real, sqliteTable, text} from './sqlite.ts';

const notes = sqliteTable('notes', {
  title: text('title', {length: 20}).notNull(),
  words: integer('words').notNull(),
  rating: real('rating').notNull(),
  createdAt: integer('created_at', {mode: 'timestamp'}).notNull(),
});

type NoteRow = InferSelectModel<typeof notes>;

const fullRow = {title: 'groceries', words: 42, rating: 4.5, createdAt: new Date()};

describe('sqlite proxy - captured params reach the compiled validator', () => {
  const validate = createValidateFn<NoteRow>();

  it('accepts a valid row', () => {
    expect(validate(fullRow)).toBe(true);
  });

  it('enforces the captured text length at the boundary', () => {
    expect(validate({...fullRow, title: 'x'.repeat(20)})).toBe(true);
    expect(validate({...fullRow, title: 'x'.repeat(21)})).toBe(false);
  });

  it('enforces the integer stamp and hydrated Date for timestamp mode', () => {
    expect(validate({...fullRow, words: 1.5})).toBe(false);
    expect(validate({...fullRow, rating: 4.5})).toBe(true);
    expect(validate({...fullRow, createdAt: 'not-a-date'})).toBe(false);
  });
});

// CLAUDE.md marker-coverage rule: both getRunTypeId call shapes over the row.
describe('sqlite proxy - marker coverage + shared compiled functions', () => {
  it('static and reflection getRunTypeId shapes resolve the same id', () => {
    const staticId = getRunTypeId<NoteRow>();
    const sample: NoteRow = fullRow;
    expect(getRunTypeId(sample)).toBe(staticId);
  });

  it('two call sites naming the same row type share ONE compiled function object', () => {
    const first = createValidateFn<NoteRow>();
    const second = createValidateFn<NoteRow>();
    expect(second).toBe(first);
  });
});

describe('sqlite proxy - wrappers build the exact drizzle column (stamp is type-only)', () => {
  const rawNotes = drizzleSqliteTable('notes', {
    title: drizzleText('title', {length: 20}).notNull(),
  });

  it('proxy columns match raw drizzle columns config-for-config', () => {
    expect(notes.title.columnType).toBe(rawNotes.title.columnType);
    expect(notes.title.getSQLType()).toBe(rawNotes.title.getSQLType());
  });
});
