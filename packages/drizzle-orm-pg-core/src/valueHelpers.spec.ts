/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Value pins for the pg helpers that produce handles rather than plain
// tables: pgSchema (and its .table/.enum/.sequence members), pgSequence and
// pgTableCreator. Raw drizzle is the oracle: every recorded handle must
// materialize through toDrizzle into the same object drizzle builds by hand.
// These specs are purely value-level (no marker API), so the Marker test
// coverage rule does not apply here.

import {describe, it, expect} from 'vitest';
import * as dzPg from 'drizzle-orm/pg-core';
import {getTableConfig} from 'drizzle-orm/pg-core';
import {index, integer, pgSchema, pgSequence, pgTable, pgTableCreator, varchar} from './index.ts';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {toDrizzle} from './drizzle.ts';

/** Compact getTableConfig projection: just what the helper wiring decides
 *  (the wide per-column matrix is already pinned by index.spec.ts). */
function project(table: Parameters<typeof getTableConfig>[0]) {
  const config = getTableConfig(table);
  return {
    name: config.name,
    schema: config.schema,
    columns: config.columns.map((column) => ({
      name: column.name,
      sqlType: column.getSQLType(),
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      primary: column.primary,
    })),
    indexes: config.indexes.map((idx) => {
      const indexConfig = (idx as unknown as {config: {name?: string; unique: boolean; columns: unknown[]}}).config;
      return {
        name: indexConfig.name,
        unique: indexConfig.unique,
        columns: indexConfig.columns.map((column) => (column as {name: string}).name),
      };
    }),
  };
}

const sequenceFields = (sequence: unknown) => {
  const {seqName, seqOptions, schema} = sequence as {seqName?: string; seqOptions?: object; schema?: string};
  return {seqName, seqOptions, schema};
};

// ── pgSchema and its members ─────────────────────────────────────────────────

const appSchema = pgSchema('app');
const dzAppSchema = dzPg.pgSchema('app');

const schemaUsers = appSchema.table(
  'users',
  {
    id: integer('id').primaryKey(),
    name: varchar('name', {length: 50}).notNull(),
  },
  (t) => [index('app_users_name_idx').on(t.name)]
);
const dzSchemaUsers = dzAppSchema.table(
  'users',
  {
    id: dzPg.integer('id').primaryKey(),
    name: dzPg.varchar('name', {length: 50}).notNull(),
  },
  (t) => [dzPg.index('app_users_name_idx').on(t.name)]
);

describe('pg value helpers — pgSchema', () => {
  it('the schema handle materializes to a real drizzle PgSchema', () => {
    const materialized = toDrizzle(appSchema);
    expect(materialized).toBeInstanceOf(dzPg.PgSchema);
    expect(materialized.schemaName).toBe('app');
  });

  it('schema.table materializes schema-qualified, equal to the raw drizzle twin', () => {
    expect(project(toDrizzle(schemaUsers))).toEqual(project(dzSchemaUsers));
    expect(getTableConfig(toDrizzle(schemaUsers)).schema).toBe('app');
  });

  it('schema.enum materializes schema-qualified with the recorded name and values', () => {
    const moodEnum = appSchema.enum('mood', ['happy', 'sad']);
    const dzMoodEnum = dzAppSchema.enum('mood', ['happy', 'sad']);
    const materialized = toDrizzle(moodEnum);
    expect(materialized.enumName).toBe(dzMoodEnum.enumName);
    expect(materialized.enumValues).toEqual(dzMoodEnum.enumValues);
    expect((materialized as unknown as {schema?: string}).schema).toBe('app');
  });

  it('schema.sequence materializes to the drizzle sequence with name, options and schema', () => {
    const appSeq = appSchema.sequence('app_seq', {startWith: 100, increment: 5});
    const dzAppSeq = dzAppSchema.sequence('app_seq', {startWith: 100, increment: 5});
    const materialized = toDrizzle(appSeq);
    expect(dzPg.isPgSequence(materialized)).toBe(true);
    expect(sequenceFields(materialized)).toEqual(sequenceFields(dzAppSeq));
  });
});

// ── pgSequence ───────────────────────────────────────────────────────────────

describe('pg value helpers — pgSequence', () => {
  it('materializes with the recorded name and options, equal to raw drizzle', () => {
    const orderSeq = pgSequence('order_seq', {startWith: 10, increment: 2, cycle: true});
    const dzOrderSeq = dzPg.pgSequence('order_seq', {startWith: 10, increment: 2, cycle: true});
    const materialized = toDrizzle(orderSeq);
    expect(dzPg.isPgSequence(materialized)).toBe(true);
    expect(sequenceFields(materialized)).toEqual(sequenceFields(dzOrderSeq));
  });

  it('the no-options form materializes too, memoized', () => {
    const bareSeq = pgSequence('bare_seq');
    expect(sequenceFields(toDrizzle(bareSeq))).toEqual(sequenceFields(dzPg.pgSequence('bare_seq')));
    expect(toDrizzle(bareSeq)).toBe(toDrizzle(bareSeq));
  });
});

// ── pgTableCreator ───────────────────────────────────────────────────────────

const prefixed = pgTableCreator((name) => `pre_${name}`);
const dzPrefixed = dzPg.pgTableCreator((name) => `pre_${name}`);

const creatorUsers = prefixed('users', {
  id: integer('id').primaryKey(),
  name: varchar('name', {length: 50}).notNull(),
});
const dzCreatorUsers = dzPrefixed('users', {
  id: dzPg.integer('id').primaryKey(),
  name: dzPg.varchar('name', {length: 50}).notNull(),
});

describe('pg value helpers — pgTableCreator', () => {
  it('applies the name mapper exactly like raw drizzle', () => {
    expect(getTableConfig(toDrizzle(creatorUsers)).name).toBe('pre_users');
    expect(project(toDrizzle(creatorUsers))).toEqual(project(dzCreatorUsers));
  });

  it('memoizes: every call returns the same drizzle table', () => {
    expect(toDrizzle(creatorUsers)).toBe(toDrizzle(creatorUsers));
  });
});

// ── model derivation on creator/schema tables ────────────────────────────────

const plainUsers = pgTable('users', {
  id: integer('id').primaryKey(),
  name: varchar('name', {length: 50}).notNull(),
});

describe('pg value helpers — model derivation', () => {
  it('creator and schema tables derive the same select model as a plain table', () => {
    expect(getTableConfig(toDrizzle(plainUsers)).name).toBe('users');
    const creatorRow: InferSelectModel<typeof creatorUsers> = {id: 1, name: 'ann'};
    const schemaRow: InferSelectModel<typeof schemaUsers> = creatorRow;
    const plainRow: InferSelectModel<typeof plainUsers> = schemaRow;
    const backToCreator: InferSelectModel<typeof creatorUsers> = plainRow;
    expect(backToCreator).toEqual({id: 1, name: 'ann'});
  });
});
