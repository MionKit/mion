// STAGE-1 SPIKE runtime pin (docs/todos/drizzle-slim-builders.md): the slim
// recorders + toDrizzle replay build the SAME drizzle table a hand-written
// drizzle file builds. Compared through drizzle's own getTableConfig, the same
// oracle the full equality matrix and the fuzz suite will use in stage 3.

import {describe, it, expect} from 'vitest';
import {
  getTableConfig,
  index as dzIndex,
  integer as dzInteger,
  pgTable as dzPgTable,
  timestamp as dzTimestamp,
  varchar as dzVarchar,
} from 'drizzle-orm/pg-core';
import {index, integer, pgTable, refineTableType, timestamp, toDrizzle, varchar} from './slimSpike/slimPgCore.ts';

const slimUsers = pgTable(
  'users',
  {
    name: varchar('name', {length: 100}).notNull(),
    age: integer('age').notNull(),
    createdAt: timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
  },
  (t) => [index('users_name_idx').on(t.name)]
);

const rawUsers = dzPgTable(
  'users',
  {
    name: dzVarchar('name', {length: 100}).notNull(),
    age: dzInteger('age').notNull(),
    createdAt: dzTimestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
  },
  (t) => [dzIndex('users_name_idx').on(t.name)]
);

/** JSON-safe projection of the config fields the SQL depends on. */
function tableProjection(table: Parameters<typeof getTableConfig>[0]) {
  const config = getTableConfig(table);
  return {
    name: config.name,
    schema: config.schema,
    columns: config.columns.map((column) => ({
      name: column.name,
      columnType: column.columnType,
      dataType: column.dataType,
      sqlType: column.getSQLType(),
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      primary: column.primary,
    })),
    indexes: config.indexes.map((idx) => {
      const indexConfig = (idx as unknown as {config: {name?: string; columns: Array<{name?: string}>; unique: boolean}}).config;
      return {
        name: indexConfig.name,
        unique: indexConfig.unique,
        columns: indexConfig.columns.map((column) => column.name),
      };
    }),
  };
}

describe('slim spike — toDrizzle replay equals a hand-written drizzle table', () => {
  it('materializes byte-equal column and index configs', () => {
    expect(tableProjection(toDrizzle(slimUsers))).toEqual(tableProjection(rawUsers));
  });

  it('memoizes: every call returns the same drizzle table object', () => {
    expect(toDrizzle(slimUsers)).toBe(toDrizzle(slimUsers));
  });

  it('refineTableType is identity at runtime and shares the materialized table', () => {
    const refined = refineTableType(slimUsers, {name: {minLength: 10}});
    expect(refined as unknown).toBe(slimUsers);
    expect(toDrizzle(refined)).toBe(toDrizzle(slimUsers));
  });
});
