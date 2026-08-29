/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Value pins for sqliteTableCreator, the one sqlite helper that produces a
// handle rather than a plain table. Raw drizzle is the oracle: the recorded
// creator must materialize through toDrizzle into the same table drizzle
// builds by hand. These specs are purely value-level (no marker API), so the
// Marker test coverage rule does not apply here.

import {describe, it, expect} from 'vitest';
import * as dzSqlite from 'drizzle-orm/sqlite-core';
import {getTableConfig} from 'drizzle-orm/sqlite-core';
import {index, integer, sqliteTable, sqliteTableCreator, text} from './index.ts';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {toDrizzle} from './drizzle.ts';

/** Compact getTableConfig projection: just what the helper wiring decides
 *  (the wide per-column matrix is already pinned by index.spec.ts). */
function project(table: Parameters<typeof getTableConfig>[0]) {
  const config = getTableConfig(table);
  return {
    name: config.name,
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

// ── sqliteTableCreator ───────────────────────────────────────────────────────

const prefixed = sqliteTableCreator((name) => `pre_${name}`);
const dzPrefixed = dzSqlite.sqliteTableCreator((name) => `pre_${name}`);

const creatorUsers = prefixed(
  'users',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
  },
  (t) => [index('users_name_idx').on(t.name)]
);
const dzCreatorUsers = dzPrefixed(
  'users',
  {
    id: dzSqlite.integer('id').primaryKey(),
    name: dzSqlite.text('name').notNull(),
  },
  (t) => [dzSqlite.index('users_name_idx').on(t.name)]
);

describe('sqlite value helpers — sqliteTableCreator', () => {
  it('applies the name mapper exactly like raw drizzle (extraConfig included)', () => {
    expect(getTableConfig(toDrizzle(creatorUsers)).name).toBe('pre_users');
    expect(project(toDrizzle(creatorUsers))).toEqual(project(dzCreatorUsers));
  });

  it('memoizes: every call returns the same drizzle table', () => {
    expect(toDrizzle(creatorUsers)).toBe(toDrizzle(creatorUsers));
  });
});

// ── model derivation on creator tables ───────────────────────────────────────

const plainUsers = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
});

describe('sqlite value helpers — model derivation', () => {
  it('a creator table derives the same select model as a plain table', () => {
    expect(getTableConfig(toDrizzle(plainUsers)).name).toBe('users');
    const creatorRow: InferSelectModel<typeof creatorUsers> = {id: 1, name: 'ann'};
    const plainRow: InferSelectModel<typeof plainUsers> = creatorRow;
    const backToCreator: InferSelectModel<typeof creatorUsers> = plainRow;
    expect(backToCreator).toEqual({id: 1, name: 'ann'});
  });
});
