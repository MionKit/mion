/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Runtime pins for the slim mysql surface: toDrizzle materializes EXACTLY the
// table a hand-written drizzle file builds (getTableConfig oracle), models
// compile full-fidelity validators, and the chain-method completeness diff
// keeps a drizzle upgrade from silently adding modifiers we do not record.

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
import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
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
} from './index.ts';
import type {InferInsertModel, InferSelectModel, InferSelectViewModel, InferUpdateModel} from '@mionjs/drizzle-orm';
import {cols, refineTableType, sql} from '@mionjs/drizzle-orm';
import {toDrizzle} from './drizzle.ts';
import {mysqlView} from './views.ts';

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
  id: serial('id').primaryKey(),
  code: varchar('code', {length: 10}).notNull().unique(),
});
const dzTeams = dzMysqlTable('teams', {
  id: dzSerial('id').primaryKey(),
  code: dzVarchar('code', {length: 10}).notNull().unique(),
});

const users = mysqlTable(
  'users',
  {
    id: int('id').autoincrement().primaryKey(),
    name: varchar('name', {length: 100}).notNull(),
    role: mysqlEnum('role', ['admin', 'user']).notNull(),
    plan: text('plan', {enum: ['free', 'pro']}).default('free'),
    level: tinyint('level', {unsigned: true}),
    born: year('born'),
    active: boolean('active').notNull().default(true),
    meta: json('meta').$type<{tags: string[]}>(),
    teamId: int('team_id').references(() => cols(teams).id, {onDelete: 'cascade'}),
    fullName: text('full_name').generatedAlwaysAs(sql`name`),
    seenAt: datetime('seen_at', {mode: 'string'}),
    createdAt: timestamp('created_at').notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    index('users_name_idx').on(t.name, t.level).using('btree'),
    unique('users_name_uq').on(t.name),
    foreignKey({name: 'users_team_fk', columns: [t.teamId], foreignColumns: [cols(teams).id]}).onUpdate('restrict'),
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

const memberships = mysqlTable('memberships', {userId: int('user_id').notNull(), teamId: int('team_id').notNull()}, (t) => [
  primaryKey({name: 'memberships_pk', columns: [t.userId, t.teamId]}),
]);
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
  named: mysqlEnum('named', PinnedRole).notNull(),
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

const people = mysqlTable('people', {
  id: serial('id').primaryKey(),
  name: varchar('name', {length: 100}).notNull(),
  age: int('age').notNull(),
  role: mysqlEnum('role', ['admin', 'user']).notNull(),
  bio: text('bio'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
const apiPeople = refineTableType(people, {name: {minLength: 3}, age: {min: 18}});
type Person = InferSelectModel<typeof apiPeople>;
type NewPerson = InferInsertModel<typeof apiPeople>;
type PersonPatch = InferUpdateModel<typeof apiPeople>;

const validPerson = {id: 1, name: 'ann-lee', age: 30, role: 'admin', bio: null, createdAt: new Date()};

describe('mysql slim surface — models compile full-fidelity validators', () => {
  const validatePerson = createValidateFn<Person>();
  const validateInsert = createValidateFn<NewPerson>();
  const validatePatch = createValidateFn<PersonPatch>();

  it('the refined table is the same object; only typeof carries the refinement', () => {
    expect(apiPeople).toBe(people);
  });

  it('accepts a valid row and enforces captured + refined params', () => {
    expect(validatePerson(validPerson)).toBe(true);
    expect(validatePerson({...validPerson, id: -1})).toBe(false); // serial is PositiveInt
    expect(validatePerson({...validPerson, name: 'x'.repeat(101)})).toBe(false);
    expect(validatePerson({...validPerson, name: 'ab'})).toBe(false);
    expect(validatePerson({...validPerson, age: 17})).toBe(false);
    expect(validatePerson({...validPerson, role: 'root'})).toBe(false);
  });

  it('insert makes serial + defaults optional; patch is a real partial', () => {
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

describe('mysql slim surface — chain-method completeness against drizzle', () => {
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
    'defaultNow',
    'onUpdateNow',
    'primaryKey',
    'unique',
    'references',
    'generatedAlwaysAs',
    'autoincrement',
  ]);
  const RAW: Record<string, object> = {
    bigint: dzMy.bigint('c', {mode: 'number'}),
    binary: dzMy.binary('c'),
    boolean: dzMy.boolean('c'),
    char: dzMy.char('c'),
    date: dzMy.date('c'),
    datetime: dzMy.datetime('c'),
    decimal: dzMy.decimal('c'),
    double: dzMy.double('c'),
    float: dzMy.float('c'),
    int: dzMy.int('c'),
    json: dzMy.json('c'),
    longtext: dzMy.longtext('c'),
    mediumint: dzMy.mediumint('c'),
    mediumtext: dzMy.mediumtext('c'),
    mysqlEnum: dzMy.mysqlEnum('c', ['a']),
    real: dzMy.real('c'),
    serial: dzMy.serial('c'),
    smallint: dzMy.smallint('c'),
    text: dzMy.text('c'),
    time: dzMy.time('c'),
    timestamp: dzMy.timestamp('c'),
    tinyint: dzMy.tinyint('c'),
    tinytext: dzMy.tinytext('c'),
    varbinary: dzMy.varbinary('c', {length: 4}),
    varchar: dzMy.varchar('c', {length: 4}),
    year: dzMy.year('c'),
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
  .as(sql`select ${cols(teams).id}, ${cols(teams).code} from ${teams}`);
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
