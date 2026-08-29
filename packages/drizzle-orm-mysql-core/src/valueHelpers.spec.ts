/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Value pins for the mysql helpers that produce handles rather than plain
// tables: mysqlSchema (and its .table member) and mysqlTableCreator. Raw
// drizzle is the oracle: every recorded handle must materialize through
// toDrizzle into the same object drizzle builds by hand. These specs are
// purely value-level (no marker API), so the Marker test coverage rule does
// not apply here.

import {describe, it, expect} from 'vitest';
import * as dzMy from 'drizzle-orm/mysql-core';
import {getTableConfig} from 'drizzle-orm/mysql-core';
import {index, int, mysqlSchema, mysqlTable, mysqlTableCreator, varchar} from './index.ts';
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

// ── mysqlSchema ──────────────────────────────────────────────────────────────

const appSchema = mysqlSchema('app');
const dzAppSchema = dzMy.mysqlSchema('app');

const schemaUsers = appSchema.table(
  'users',
  {
    id: int('id').primaryKey(),
    name: varchar('name', {length: 50}).notNull(),
  },
  (t) => [index('app_users_name_idx').on(t.name)]
);
const dzSchemaUsers = dzAppSchema.table(
  'users',
  {
    id: dzMy.int('id').primaryKey(),
    name: dzMy.varchar('name', {length: 50}).notNull(),
  },
  (t) => [dzMy.index('app_users_name_idx').on(t.name)]
);

describe('mysql value helpers — mysqlSchema', () => {
  it('the schema handle materializes to a real drizzle MySqlSchema', () => {
    const materialized = toDrizzle(appSchema);
    expect(materialized).toBeInstanceOf(dzMy.MySqlSchema);
    expect((materialized as dzMy.MySqlSchema).schemaName).toBe('app');
  });

  it('schema.table materializes schema-qualified, equal to the raw drizzle twin', () => {
    expect(project(toDrizzle(schemaUsers))).toEqual(project(dzSchemaUsers));
    expect(getTableConfig(toDrizzle(schemaUsers)).schema).toBe('app');
  });
});

// ── mysqlTableCreator ────────────────────────────────────────────────────────

const prefixed = mysqlTableCreator((name) => `pre_${name}`);
const dzPrefixed = dzMy.mysqlTableCreator((name) => `pre_${name}`);

const creatorUsers = prefixed('users', {
  id: int('id').primaryKey(),
  name: varchar('name', {length: 50}).notNull(),
});
const dzCreatorUsers = dzPrefixed('users', {
  id: dzMy.int('id').primaryKey(),
  name: dzMy.varchar('name', {length: 50}).notNull(),
});

describe('mysql value helpers — mysqlTableCreator', () => {
  it('applies the name mapper exactly like raw drizzle', () => {
    expect(getTableConfig(toDrizzle(creatorUsers)).name).toBe('pre_users');
    expect(project(toDrizzle(creatorUsers))).toEqual(project(dzCreatorUsers));
  });

  it('memoizes: every call returns the same drizzle table', () => {
    expect(toDrizzle(creatorUsers)).toBe(toDrizzle(creatorUsers));
  });
});

// ── model derivation on creator/schema tables ────────────────────────────────

const plainUsers = mysqlTable('users', {
  id: int('id').primaryKey(),
  name: varchar('name', {length: 50}).notNull(),
});

describe('mysql value helpers — model derivation', () => {
  it('creator and schema tables derive the same select model as a plain table', () => {
    expect(getTableConfig(toDrizzle(plainUsers)).name).toBe('users');
    const creatorRow: InferSelectModel<typeof creatorUsers> = {id: 1, name: 'ann'};
    const schemaRow: InferSelectModel<typeof schemaUsers> = creatorRow;
    const plainRow: InferSelectModel<typeof plainUsers> = schemaRow;
    const backToCreator: InferSelectModel<typeof creatorUsers> = plainRow;
    expect(backToCreator).toEqual({id: 1, name: 'ann'});
  });
});
