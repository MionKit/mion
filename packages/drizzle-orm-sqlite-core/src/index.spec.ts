/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Runtime pins for the slim sqlite surface: toDrizzle materializes EXACTLY
// the table a hand-written drizzle file builds (getTableConfig oracle),
// models compile full-fidelity validators, and the chain-method completeness
// diff keeps a drizzle upgrade from silently adding modifiers we do not
// record.

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
import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
import {check, foreignKey, index, integer, numeric, primaryKey, real, sqliteTable, text, unique} from './index.ts';
import type {InferInsertModel, InferSelectModel, InferSelectViewModel, InferUpdateModel} from '@mionjs/drizzle-orm';
import {cols, refineTableType, sql} from '@mionjs/drizzle-orm';
import {toDrizzle} from './drizzle.ts';
import {sqliteView, view as sqliteViewAlias} from './views.ts';

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
  id: integer('id').primaryKey({autoIncrement: true}),
  code: text('code', {length: 10}).notNull().unique(),
});
const dzTeams = dzSqliteTable('teams', {
  id: dzInteger('id').primaryKey({autoIncrement: true}),
  code: dzText('code', {length: 10}).notNull().unique(),
});

const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({autoIncrement: true}),
    name: text('name', {length: 100}).notNull(),
    role: text('role', {enum: ['admin', 'user']}).notNull(),
    score: real('score').default(0.5),
    balance: numeric('balance', {mode: 'number'}),
    active: integer('active', {mode: 'boolean'}).notNull().default(true),
    teamId: integer('team_id').references(() => cols(teams).id, {onDelete: 'cascade'}),
    fullName: text('full_name').generatedAlwaysAs(sql`name`),
    createdAt: integer('created_at', {mode: 'timestamp'}).notNull().default(sql.raw('(unixepoch())')),
  },
  (t) => [
    index('users_name_idx')
      .on(t.name)
      .where(sql`${t.score} > ${0}`),
    unique('users_name_uq').on(t.name),
    foreignKey({name: 'users_team_fk', columns: [t.teamId], foreignColumns: [cols(teams).id]}).onUpdate('restrict'),
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
  {userId: integer('user_id').notNull(), teamId: integer('team_id').notNull()},
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

const people = sqliteTable('people', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
  role: text('role', {enum: ['admin', 'user']}).notNull(),
  bio: text('bio'),
  createdAt: integer('created_at', {mode: 'timestamp'})
    .notNull()
    .$defaultFn(() => new Date()),
});
const apiPeople = refineTableType(people, {name: {minLength: 3}, age: {min: 18}});
type Person = InferSelectModel<typeof apiPeople>;
type NewPerson = InferInsertModel<typeof apiPeople>;
type PersonPatch = InferUpdateModel<typeof apiPeople>;

const validPerson = {id: 1, name: 'ann-lee', age: 30, role: 'admin', bio: null, createdAt: new Date()};

describe('sqlite slim surface — models compile full-fidelity validators', () => {
  const validatePerson = createValidateFn<Person>();
  const validateInsert = createValidateFn<NewPerson>();
  const validatePatch = createValidateFn<PersonPatch>();

  it('the refined table is the same object; only typeof carries the refinement', () => {
    expect(apiPeople).toBe(people);
  });

  it('accepts a valid row (timestamp mode as real Date) and enforces params', () => {
    expect(validatePerson(validPerson)).toBe(true);
    expect(validatePerson({...validPerson, createdAt: 'not-a-date'})).toBe(false);
    expect(validatePerson({...validPerson, name: 'x'.repeat(101)})).toBe(false);
    expect(validatePerson({...validPerson, name: 'ab'})).toBe(false);
    expect(validatePerson({...validPerson, age: 17})).toBe(false);
    expect(validatePerson({...validPerson, role: 'root'})).toBe(false);
  });

  it('insert makes the auto-increment pk + runtime defaults optional; patch is partial', () => {
    expect(validateInsert({name: 'ann-lee', age: 21, role: 'user'})).toBe(true);
    expect(validatePatch({})).toBe(true);
    expect(validatePatch({age: 17})).toBe(false);
  });

  // Marker test coverage rule: both getRunTypeId call shapes, paired.
  it('getRunTypeId static form resolves the model', () => {
    expect(getRunTypeId<Person>()).toBeTruthy();
  });
  it('getRunTypeId reflection form resolves the model', () => {
    const person: Person = validPerson as Person;
    expect(getRunTypeId(person)).toBeTruthy();
  });
  it('both getRunTypeId forms resolve to the same id', () => {
    const person: Person = validPerson as Person;
    expect(getRunTypeId(person)).toBe(getRunTypeId<Person>());
  });
});

// ── integer primary key: the rowid, so it carries a database default ─────────
// drizzle marks its sqlite integer builder `primaryKeyHasDefault: true`, the
// only column in any dialect that does. Without the same rule, `.primaryKey()`
// reads as required on insert and `db.insert(t).values({name: 'x'})` fails to
// typecheck against a table every sqlite app writes.

const rowid = sqliteTable('rowid', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
});
type NewRowid = InferInsertModel<typeof rowid>;

// A text primary key has NO default, so it stays required.
const textKeyed = sqliteTable('text_keyed', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});
type NewTextKeyed = InferInsertModel<typeof textKeyed>;

describe('sqlite slim surface — integer primary key carries a default', () => {
  it('leaves the integer key optional on insert, and a text key required', () => {
    const withoutId: NewRowid = {name: 'ann'};
    expect(withoutId.name).toBe('ann');
    // @ts-expect-error a text primary key has no database default
    const missingTextId: NewTextKeyed = {name: 'ann'};
    expect(missingTextId.name).toBe('ann');
  });

  it('matches what drizzle itself infers for the same table', () => {
    expect(getTableConfig(toDrizzle(rowid)).columns.map((column) => [column.name, column.hasDefault])).toEqual([
      ['id', true],
      ['name', false],
    ]);
    expect(getTableConfig(toDrizzle(textKeyed)).columns.map((column) => [column.name, column.hasDefault])).toEqual([
      ['id', false],
      ['name', false],
    ]);
  });
});

describe('sqlite slim surface — chain-method completeness against drizzle', () => {
  function runtimeMethods(value: object): string[] {
    const names = new Set<string>();
    for (const name of Object.getOwnPropertyNames(value)) {
      if (name !== 'constructor' && typeof (value as Record<string, unknown>)[name] === 'function') names.add(name);
    }
    let proto = Object.getPrototypeOf(value);
    while (proto && proto !== Object.prototype) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name !== 'constructor' && typeof proto[name] === 'function') names.add(name);
      }
      proto = Object.getPrototypeOf(proto);
    }
    return [...names].sort();
  }
  const INTERNAL = new Set(['build', 'buildExtraConfigColumn', 'buildForeignKeys', 'setName']);
  const SLIM = new Set([
    '$type',
    '$default',
    '$defaultFn',
    '$onUpdate',
    '$onUpdateFn',
    'notNull',
    'default',
    'primaryKey',
    'unique',
    'references',
    'generatedAlwaysAs',
  ]);
  const RAW: Record<string, object> = {
    blob: dzSqlite.blob('c'),
    int: dzSqlite.int('c'),
    integer: dzSqlite.integer('c'),
    numeric: dzSqlite.numeric('c'),
    real: dzSqlite.real('c'),
    text: dzSqlite.text('c'),
  };
  for (const [fnName, builder] of Object.entries(RAW)) {
    it(`${fnName}: every drizzle modifier is covered by the slim surface`, () => {
      const uncovered = runtimeMethods(builder).filter((method) => !INTERNAL.has(method) && !SLIM.has(method));
      expect(uncovered, `drizzle's ${fnName} builder grew modifiers the slim surface does not record`).toEqual([]);
    });
  }
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
  code: text('code').notNull(),
}).as(sql`select ${cols(teams).id}, ${cols(teams).code} from ${teams}`);
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

  it('the `view` alias is the same factory drizzle exports twice', () => {
    expect(sqliteViewAlias).toBe(sqliteView);
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
