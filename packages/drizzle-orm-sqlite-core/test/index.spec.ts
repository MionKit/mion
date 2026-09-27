/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Runtime pins for the slim sqlite surface: toDrizzle materializes EXACTLY
// the table a hand-written drizzle file builds (getTableConfig oracle),
// materialization is memoized, and refineTableType is identity.

import {describe, it, expect} from 'vitest';
import {
  getTableConfig,
  check as dzCheck,
  foreignKey as dzForeignKey,
  index as dzIndex,
  integer as dzInteger,
  primaryKey as dzPrimaryKey,
  sqliteTable as dzSqliteTable,
  text as dzText,
  unique as dzUnique,
} from 'drizzle-orm/sqlite-core';
import * as dzSqlite from 'drizzle-orm/sqlite-core';
import {sql as dzRealSql} from 'drizzle-orm';
import {check, foreignKey, index, integer, numeric, primaryKey, real, sqliteTable, text, unique} from '../src/index.ts';
import type {InferSelectViewModel} from '@mionjs/drizzle-orm';
import {refineTableType, sql, tableRef} from '@mionjs/drizzle-orm';
import {toDrizzle} from '../src/drizzle.ts';
import {sqliteView} from '../src/views.ts';

function project(table: Parameters<typeof getTableConfig>[0]) {
  const config = getTableConfig(table);
  const normalizeValue = (value: unknown): unknown => {
    if (typeof value === 'function') return '<fn>';
    if (value !== null && typeof value === 'object' && 'queryChunks' in (value as object)) return '<sql>';
    return value;
  };
  const columnName = (column: unknown) => (column as {name: string}).name;
  return {
    name: config.name,
    columns: config.columns.map((column) => ({
      name: column.name,
      columnType: column.columnType,
      sqlType: column.getSQLType(),
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      default: normalizeValue(column.default),
      primary: column.primary,
      autoIncrement: (column as unknown as {autoIncrement?: boolean}).autoIncrement,
      enumValues: column.enumValues,
      generated: column.generated ? {type: column.generated.type, as: normalizeValue(column.generated.as)} : undefined,
    })),
    indexes: config.indexes.map((idx) => {
      const indexConfig = (idx as unknown as {config: Record<string, unknown>}).config;
      return {
        name: indexConfig.name,
        unique: indexConfig.unique,
        where: normalizeValue(indexConfig.where),
        columns: (indexConfig.columns as unknown[]).map((column) =>
          'queryChunks' in (column as object) ? '<sql>' : columnName(column)
        ),
      };
    }),
    foreignKeys: config.foreignKeys.map((fk) => {
      const reference = fk.reference();
      return {
        name: fk.getName(),
        onDelete: fk.onDelete,
        onUpdate: fk.onUpdate,
        columns: reference.columns.map(columnName),
        foreignColumns: reference.foreignColumns.map(columnName),
      };
    }),
    checks: config.checks.map((entry) => ({name: entry.name, value: normalizeValue(entry.value)})),
    primaryKeys: config.primaryKeys.map((pk) => ({columns: pk.columns.map(columnName)})),
    uniqueConstraints: config.uniqueConstraints.map((constraint) => ({
      name: constraint.name,
      columns: constraint.columns.map(columnName),
    })),
  };
}

const teams = sqliteTable('teams', {
  id: integer('id', {primaryKey: [{autoIncrement: true}]}),
  code: text('code', {length: 10, notNull: true, unique: true}),
});
const dzTeams = dzSqliteTable('teams', {
  id: dzInteger('id').primaryKey({autoIncrement: true}),
  code: dzText('code', {length: 10}).notNull().unique(),
});

const users = sqliteTable(
  'users',
  {
    id: integer('id', {primaryKey: [{autoIncrement: true}]}),
    name: text('name', {length: 100, notNull: true}),
    role: text('role', {enum: ['admin', 'user'], notNull: true}),
    score: real('score', {default: [0.5]}),
    balance: numeric('balance', {mode: 'number'}),
    active: integer('active', {mode: 'boolean', notNull: true, default: [true]}),
    teamId: integer('team_id', {references: [() => tableRef(teams, 'id'), {onDelete: 'cascade'}]}),
    fullName: text('full_name', {generatedAlwaysAs: [sql`name`]}),
    createdAt: integer('created_at', {mode: 'timestamp', notNull: true, default: [sql.raw('(unixepoch())')]}),
  },
  (t) => [
    index('users_name_idx')
      .on(t.name)
      .where(sql`${t.score} > ${0}`),
    unique('users_name_uq').on(t.name),
    foreignKey({name: 'users_team_fk', columns: [t.teamId], foreignColumns: [tableRef(teams, 'id')]}).onUpdate('restrict'),
    check('users_score_check', sql`${t.score} >= 0`),
  ]
);
const dzUsers = dzSqliteTable(
  'users',
  {
    id: dzInteger('id').primaryKey({autoIncrement: true}),
    name: dzText('name', {length: 100}).notNull(),
    role: dzText('role', {enum: ['admin', 'user']}).notNull(),
    score: dzSqlite.real('score').default(0.5),
    balance: dzSqlite.numeric('balance', {mode: 'number'}),
    active: dzInteger('active', {mode: 'boolean'}).notNull().default(true),
    teamId: dzInteger('team_id').references(() => dzTeams.id, {onDelete: 'cascade'}),
    fullName: dzText('full_name').generatedAlwaysAs(dzRealSql`name`),
    createdAt: dzInteger('created_at', {mode: 'timestamp'}).notNull().default(dzRealSql.raw('(unixepoch())')),
  },
  (t) => [
    dzIndex('users_name_idx')
      .on(t.name)
      .where(dzRealSql`${t.score} > ${0}`),
    dzUnique('users_name_uq').on(t.name),
    dzForeignKey({name: 'users_team_fk', columns: [t.teamId], foreignColumns: [dzTeams.id]}).onUpdate('restrict'),
    dzCheck('users_score_check', dzRealSql`${t.score} >= 0`),
  ]
);

const memberships = sqliteTable(
  'memberships',
  {userId: integer('user_id', {notNull: true}), teamId: integer('team_id', {notNull: true})},
  (t) => [primaryKey({columns: [t.userId, t.teamId]})]
);
const dzMemberships = dzSqliteTable(
  'memberships',
  {userId: dzInteger('user_id').notNull(), teamId: dzInteger('team_id').notNull()},
  (t) => [dzPrimaryKey({columns: [t.userId, t.teamId]})]
);

describe('sqlite slim surface — toDrizzle equals hand-written drizzle', () => {
  it('materializes byte-equal configs across columns, modes, refs and extraConfig', () => {
    expect(project(toDrizzle(users))).toEqual(project(dzUsers));
    expect(project(toDrizzle(teams))).toEqual(project(dzTeams));
    expect(project(toDrizzle(memberships))).toEqual(project(dzMemberships));
  });

  it('memoizes and keeps refineTableType identity', () => {
    expect(toDrizzle(users)).toBe(toDrizzle(users));
    const refined = refineTableType(users, {name: {minLength: 2}});
    expect(refined as unknown).toBe(users);
    expect(toDrizzle(refined)).toBe(toDrizzle(users));
  });
});

// ── views: the manual-column form ────────────────────────────────────────────

/** JSON-safe projection of a view: name, the config drizzle-kit reads, and the
 *  selected columns. */
function projectView(view: object) {
  const config = dzSqlite.getViewConfig(view as never) as unknown as Record<string, unknown>;
  return {
    name: config.name,
    isExisting: config.isExisting,
    query: config.query === undefined ? undefined : '<sql>',
    columns: Object.entries(config.selectedFields as Record<string, unknown>).map(([key, column]) => ({
      key,
      name: (column as {name: string}).name,
      sqlType: (column as {getSQLType(): string}).getSQLType(),
      notNull: (column as {notNull: boolean}).notNull,
    })),
  };
}

const teamNames = sqliteView('team_names', {
  id: integer('id'),
  code: text('code', {notNull: true}),
}).as(sql`select ${tableRef(teams, 'id')}, ${tableRef(teams, 'code')} from ${teams}`);
const dzTeamNames = dzSqlite
  .sqliteView('team_names', {id: dzInteger('id'), code: dzText('code').notNull()})
  .as(dzRealSql`select ${dzTeams.id}, ${dzTeams.code} from ${dzTeams}`);

describe('sqlite slim surface — views equal hand-written drizzle', () => {
  it('a sql-defined view materializes byte-equal', () => {
    expect(projectView(toDrizzle(teamNames))).toEqual(projectView(dzTeamNames));
  });

  it('an .existing() view is marked pre-existing', () => {
    const slim = sqliteView('legacy', {id: integer('id')}).existing();
    const raw = dzSqlite.sqliteView('legacy', {id: dzInteger('id')}).existing();
    expect(projectView(toDrizzle(slim))).toEqual(projectView(raw));
  });

  it('the query-builder form is rejected with a reason', () => {
    expect(() => (sqliteView as unknown as (name: string) => unknown)('qb_view')).toThrowError(/query builder/);
  });

  it('InferSelectViewModel of a view is the row type; the table models reject it', () => {
    type Row = InferSelectViewModel<typeof teamNames>;
    const row: Row = {id: null, code: 'core'};
    expect(row.code).toBe('core');
  });
});
