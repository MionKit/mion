/* @mion-expect-error rpc-handler-drizzle-import */
// Compare slim schemas with their Drizzle materializations.
/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Runtime pins for the slim mysql surface: toDrizzle materializes EXACTLY the
// table a hand-written drizzle file builds (getTableConfig oracle).

import {describe, it, expect} from 'vitest';
import {
  getTableConfig,
  check as dzCheck,
  foreignKey as dzForeignKey,
  index as dzIndex,
  int as dzInt,
  mysqlEnum as dzMysqlEnum,
  mysqlTable as dzMysqlTable,
  primaryKey as dzPrimaryKey,
  serial as dzSerial,
  text as dzText,
  timestamp as dzTimestamp,
  unique as dzUnique,
  varchar as dzVarchar,
  boolean as dzBoolean,
  json as dzJson,
  tinyint as dzTinyint,
  year as dzYear,
  datetime as dzDatetime,
} from 'drizzle-orm/mysql-core';
import * as dzMy from 'drizzle-orm/mysql-core';
import {sql as dzRealSql} from 'drizzle-orm';
import {
  boolean,
  check,
  datetime,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  serial,
  text,
  timestamp,
  tinyint,
  unique,
  varchar,
  year,
} from '../src/index.ts';
import type {InferSelectModel, InferSelectViewModel} from '@mionjs/drizzle-orm';
import {$type, refineTableType, sql, tableRef} from '@mionjs/drizzle-orm';
import {toDrizzle} from '../src/drizzle.ts';
import {mysqlView} from '../src/views.ts';

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
    schema: config.schema,
    columns: config.columns.map((column) => ({
      name: column.name,
      columnType: column.columnType,
      sqlType: column.getSQLType(),
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      default: normalizeValue(column.default),
      autoIncrement: (column as unknown as {autoIncrement?: boolean}).autoIncrement,
      primary: column.primary,
      enumValues: column.enumValues,
      generated: column.generated ? {type: column.generated.type, as: normalizeValue(column.generated.as)} : undefined,
    })),
    indexes: config.indexes.map((idx) => {
      const indexConfig = (idx as unknown as {config: Record<string, unknown>}).config;
      return {
        name: indexConfig.name,
        unique: indexConfig.unique,
        using: indexConfig.using,
        algorithm: indexConfig.algorythm ?? indexConfig.algorithm,
        lock: indexConfig.lock,
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
    primaryKeys: config.primaryKeys.map((pk) => ({name: pk.getName(), columns: pk.columns.map(columnName)})),
    uniqueConstraints: config.uniqueConstraints.map((constraint) => ({
      name: constraint.name,
      columns: constraint.columns.map(columnName),
    })),
  };
}

const teams = mysqlTable('teams', {
  id: serial('id', {primaryKey: true}),
  code: varchar('code', {length: 10, notNull: true, unique: true}),
});
const dzTeams = dzMysqlTable('teams', {
  id: dzSerial('id').primaryKey(),
  code: dzVarchar('code', {length: 10}).notNull().unique(),
});

const users = mysqlTable(
  'users',
  {
    id: int('id', {autoincrement: true, primaryKey: true}),
    name: varchar('name', {length: 100, notNull: true}),
    role: mysqlEnum('role', ['admin', 'user'], {notNull: true}),
    plan: text('plan', {enum: ['free', 'pro'], default: ['free']}),
    level: tinyint('level', {unsigned: true}),
    born: year('born'),
    active: boolean('active', {notNull: true, default: [true]}),
    meta: json('meta', {$type: $type<{tags: string[]}>()}),
    teamId: int('team_id', {references: [() => tableRef(teams, 'id'), {onDelete: 'cascade'}]}),
    fullName: text('full_name', {generatedAlwaysAs: [sql`name`]}),
    seenAt: datetime('seen_at', {mode: 'string'}),
    createdAt: timestamp('created_at', {notNull: true, defaultNow: true, onUpdateNow: true}),
  },
  (t) => [
    index('users_name_idx').on(t.name, t.level).using('btree'),
    unique('users_name_uq').on(t.name),
    foreignKey({name: 'users_team_fk', columns: [t.teamId], foreignColumns: [tableRef(teams, 'id')]}).onUpdate('restrict'),
    check('users_level_check', sql`${t.level} >= 0`),
  ]
);
const dzUsers = dzMysqlTable(
  'users',
  {
    id: dzInt('id').autoincrement().primaryKey(),
    name: dzVarchar('name', {length: 100}).notNull(),
    role: dzMysqlEnum('role', ['admin', 'user']).notNull(),
    plan: dzText('plan', {enum: ['free', 'pro']}).default('free'),
    level: dzTinyint('level', {unsigned: true}),
    born: dzYear('born'),
    active: dzBoolean('active').notNull().default(true),
    meta: dzJson('meta').$type<{tags: string[]}>(),
    teamId: dzInt('team_id').references(() => dzTeams.id, {onDelete: 'cascade'}),
    fullName: dzText('full_name').generatedAlwaysAs(dzRealSql`name`),
    seenAt: dzDatetime('seen_at', {mode: 'string'}),
    createdAt: dzTimestamp('created_at').notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    dzIndex('users_name_idx').on(t.name, t.level).using('btree'),
    dzUnique('users_name_uq').on(t.name),
    dzForeignKey({name: 'users_team_fk', columns: [t.teamId], foreignColumns: [dzTeams.id]}).onUpdate('restrict'),
    dzCheck('users_level_check', dzRealSql`${t.level} >= 0`),
  ]
);

const memberships = mysqlTable(
  'memberships',
  {userId: int('user_id', {notNull: true}), teamId: int('team_id', {notNull: true})},
  (t) => [primaryKey({name: 'memberships_pk', columns: [t.userId, t.teamId]})]
);
const dzMemberships = dzMysqlTable(
  'memberships',
  {userId: dzInt('user_id').notNull(), teamId: dzInt('team_id').notNull()},
  (t) => [dzPrimaryKey({name: 'memberships_pk', columns: [t.userId, t.teamId]})]
);

// ── mysqlEnum from a TS enum object ─────────────────────────────────────────
// drizzle takes either a values array or the enum object itself; the object is
// not a tuple, so the array overloads never accepted it.

/* eslint-disable no-unused-vars -- the members are read below as PinnedRole.admin; the rule does not follow enum members */
enum PinnedRole {
  admin = 'admin',
  user = 'user',
}
/* eslint-enable no-unused-vars */
const enumObjTable = mysqlTable('enum_obj', {
  named: mysqlEnum('named', PinnedRole, {notNull: true}),
  bare: mysqlEnum(PinnedRole),
});
const dzEnumObjTable = dzMysqlTable('enum_obj', {
  named: dzMysqlEnum('named', PinnedRole).notNull(),
  bare: dzMysqlEnum(PinnedRole),
});

describe('mysql slim surface — mysqlEnum from a TS enum object', () => {
  it('materializes byte-equal to the same table written with drizzle', () => {
    expect(project(toDrizzle(enumObjTable))).toEqual(project(dzEnumObjTable));
  });

  it('infers the enum member union as the column data', () => {
    const row: InferSelectModel<typeof enumObjTable> = {named: PinnedRole.admin, bare: null};
    expect(row.named).toBe('admin');
  });
});

describe('mysql slim surface — toDrizzle equals hand-written drizzle', () => {
  it('materializes byte-equal configs across columns, enum, refs and extraConfig', () => {
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
  const config = dzMy.getViewConfig(view as never) as unknown as Record<string, unknown>;
  return {
    name: config.name,
    schema: config.schema,
    isExisting: config.isExisting,
    query: config.query === undefined ? undefined : '<sql>',
    algorithm: config.algorithm,
    sqlSecurity: config.sqlSecurity,
    withCheckOption: config.withCheckOption,
    columns: Object.entries(config.selectedFields as Record<string, unknown>).map(([key, column]) => ({
      key,
      name: (column as {name: string}).name,
      sqlType: (column as {getSQLType(): string}).getSQLType(),
      notNull: (column as {notNull: boolean}).notNull,
    })),
  };
}

const activeTeams = mysqlView('active_teams', {
  id: int('id'),
  code: varchar('code', {length: 10}),
})
  .algorithm('merge')
  .sqlSecurity('definer')
  .withCheckOption('cascaded')
  .as(sql`select ${tableRef(teams, 'id')}, ${tableRef(teams, 'code')} from ${teams}`);
const dzActiveTeams = dzMy
  .mysqlView('active_teams', {
    id: dzMy.int('id'),
    code: dzMy.varchar('code', {length: 10}),
  })
  .algorithm('merge')
  .sqlSecurity('definer')
  .withCheckOption('cascaded')
  .as(dzRealSql`select ${dzTeams.id}, ${dzTeams.code} from ${dzTeams}`);

describe('mysql slim surface — views equal hand-written drizzle', () => {
  it('a sql-defined view carries its whole chain', () => {
    expect(projectView(toDrizzle(activeTeams))).toEqual(projectView(dzActiveTeams));
  });

  it('an .existing() view is marked pre-existing', () => {
    const slim = mysqlView('legacy', {id: int('id')}).existing();
    const raw = dzMy.mysqlView('legacy', {id: dzMy.int('id')}).existing();
    expect(projectView(toDrizzle(slim))).toEqual(projectView(raw));
  });

  it('the query-builder form is rejected with a reason', () => {
    expect(() => (mysqlView as unknown as (name: string) => unknown)('qb_view')).toThrowError(/query builder/);
  });

  it('InferSelectViewModel of a view is the row type; the table models reject it', () => {
    type Row = InferSelectViewModel<typeof activeTeams>;
    const row: Row = {id: null, code: null};
    expect(row.id).toBeNull();
  });
});
