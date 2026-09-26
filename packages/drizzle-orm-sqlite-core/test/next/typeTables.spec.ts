/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// next/ sqlite columns at run time, against the shipped builders and raw drizzle.

import {describe, it, expect} from 'vitest';
import * as dz from 'drizzle-orm/sqlite-core';
import {getRunType, getRunTypeId} from '@mionjs/run-types';
import type {ReflectedNode} from '../../../drizzle-orm/src/fromType.ts';
import type {InferInsertModel, InferSelectModel} from '../../../drizzle-orm/src/models.ts';
import type * as next from '../../../drizzle-orm/next/index.ts';
import {$type, tableRef, type TableRef} from '../../../drizzle-orm/next/index.ts';
import * as cur from '../../src/index.ts';
import {cols as curCols} from '../../../drizzle-orm/src/table.ts';
import {toDrizzle as curToDrizzle} from '../../src/drizzle.ts';
import type {Blob, CustomCol, Int, Integer, Numeric, Real, SqliteTable, Text} from '../../next/index.ts';
import {
  blob,
  customType,
  foreignKey,
  int,
  integer,
  numeric,
  real,
  sqliteTable,
  sqliteTableCreator,
  sqliteView,
  tableFromType,
  text,
  view,
} from '../../next/index.ts';
import {toDrizzle} from '../../next/drizzle.ts';
import {project, projectView} from '../tableSpecShared.ts';
import {sql} from '../../../drizzle-orm/src/recorder.ts';

const users = sqliteTable('users', {
  id: integer('id', {primaryKey: [{autoIncrement: true}]}),
  name: text('name', {length: 100, notNull: true}),
  rating: real('rating', {notNull: true, default: [4.5]}),
  bio: text('bio', {length: 500}),
  note: text(),
  createdAt: integer('created_at', {mode: 'timestamp', notNull: true}),
});
type Users = SqliteTable<
  'users',
  {
    id: Integer<{primaryKey: [{autoIncrement: true}]}>;
    name: Text<{length: 100; notNull: true}>;
    rating: Real<{notNull: true; default: [4.5]}>;
    bio: Text<{length: 500}>;
    note: Text;
    createdAt: Integer<{mode: 'timestamp'; notNull: true}>;
  },
  [],
  {createdAt: 'created_at'}
>;
const curUsers = cur.sqliteTable('users', {
  id: cur.integer('id').primaryKey({autoIncrement: true}),
  name: cur.text('name', {length: 100}).notNull(),
  rating: cur.real('rating').notNull().default(4.5),
  bio: cur.text('bio', {length: 500}),
  note: cur.text(),
  createdAt: cur.integer('created_at', {mode: 'timestamp'}).notNull(),
});
const rawUsers = dz.sqliteTable('users', {
  id: dz.integer('id').primaryKey({autoIncrement: true}),
  name: dz.text('name', {length: 100}).notNull(),
  rating: dz.real('rating').notNull().default(4.5),
  bio: dz.text('bio', {length: 500}),
  note: dz.text(),
  createdAt: dz.integer('created_at', {mode: 'timestamp'}).notNull(),
});

const wide = sqliteTable('wide', {
  id: int('id', {primaryKey: true}),
  role: text('role', {enum: ['free', 'pro'], notNull: true}),
  meta: text('meta', {mode: 'json', $type: $type<{tags: string[]}>(), notNull: true}),
  score: integer('score', {unique: ['uq_score']}),
  code: text('code', {unique: true}),
  flag: integer('flag', {mode: 'boolean', notNull: true, default: [false]}),
  stamp: integer('stamp', {mode: 'timestamp_ms'}),
  big: blob('big', {mode: 'bigint'}),
  data: blob('data', {mode: 'json'}),
  raw: blob('raw'),
  amount: numeric('amount', {mode: 'number'}),
  exact: numeric('exact'),
  derived: text('derived', {generatedAlwaysAs: ['x', {mode: 'virtual'}]}),
});
type Wide = SqliteTable<
  'wide',
  {
    id: Int<{primaryKey: true}>;
    role: Text<{enum: ['free', 'pro']; notNull: true}>;
    meta: Text<{mode: 'json'; $type: [{tags: string[]}]; notNull: true}>;
    score: Integer<{unique: ['uq_score']}>;
    code: Text<{unique: true}>;
    flag: Integer<{mode: 'boolean'; notNull: true; default: [false]}>;
    stamp: Integer<{mode: 'timestamp_ms'}>;
    big: Blob<{mode: 'bigint'}>;
    data: Blob<{mode: 'json'}>;
    raw: Blob;
    amount: Numeric<{mode: 'number'}>;
    exact: Numeric;
    derived: Text<{generatedAlwaysAs: ['x', {mode: 'virtual'}]}>;
  }
>;
const curWide = cur.sqliteTable('wide', {
  id: cur.int('id').primaryKey(),
  role: cur.text('role', {enum: ['free', 'pro']}).notNull(),
  meta: cur.text('meta', {mode: 'json'}).$type<{tags: string[]}>().notNull(),
  score: cur.integer('score').unique('uq_score'),
  code: cur.text('code').unique(),
  flag: cur.integer('flag', {mode: 'boolean'}).notNull().default(false),
  stamp: cur.integer('stamp', {mode: 'timestamp_ms'}),
  big: cur.blob('big', {mode: 'bigint'}),
  data: cur.blob('data', {mode: 'json'}),
  raw: cur.blob('raw'),
  amount: cur.numeric('amount', {mode: 'number'}),
  exact: cur.numeric('exact'),
  derived: cur.text('derived').generatedAlwaysAs('x', {mode: 'virtual'}),
});
const rawWide = dz.sqliteTable('wide', {
  id: dz.int('id').primaryKey(),
  role: dz.text('role', {enum: ['free', 'pro']}).notNull(),
  meta: dz.text('meta', {mode: 'json'}).$type<{tags: string[]}>().notNull(),
  score: dz.integer('score').unique('uq_score'),
  code: dz.text('code').unique(),
  flag: dz.integer('flag', {mode: 'boolean'}).notNull().default(false),
  stamp: dz.integer('stamp', {mode: 'timestamp_ms'}),
  big: dz.blob('big', {mode: 'bigint'}),
  data: dz.blob('data', {mode: 'json'}),
  raw: dz.blob('raw'),
  amount: dz.numeric('amount', {mode: 'number'}),
  exact: dz.numeric('exact'),
  derived: dz.text('derived').generatedAlwaysAs('x', {mode: 'virtual'}),
});

const teams = sqliteTable('teams', {id: integer({primaryKey: true})});
const members = sqliteTable('members', {
  id: integer({primaryKey: true}),
  teamId: integer('team_id', {references: [() => tableRef(teams, 'id'), {onDelete: 'cascade'}]}),
});
type Teams = SqliteTable<'teams', {id: Integer<{primaryKey: true}>}>;
type Members = SqliteTable<
  'members',
  {id: Integer<{primaryKey: true}>; teamId: Integer<{references: [{table: 'teams'; column: 'id'}, {onDelete: 'cascade'}]}>},
  [],
  {teamId: 'team_id'}
>;
type MembersByRef = SqliteTable<
  'members',
  {id: Integer<{primaryKey: true}>; teamId: Integer<{references: [TableRef<Teams, 'id'>, {onDelete: 'cascade'}]}>},
  [],
  {teamId: 'team_id'}
>;
const curTeams = cur.sqliteTable('teams', {id: cur.integer().primaryKey()});
const curMembers = cur.sqliteTable('members', {
  id: cur.integer().primaryKey(),
  teamId: cur.integer('team_id').references(() => curCols(curTeams).id, {onDelete: 'cascade'}),
});

const emps = sqliteTable('emps', {
  id: integer({primaryKey: true}),
  managerId: integer('manager_id', {references: [(): TableRef<'emps', 'id'> => tableRef(emps, 'id')]}),
});
type Emps = SqliteTable<
  'emps',
  {id: Integer<{primaryKey: true}>; managerId: Integer<{references: [{table: 'emps'; column: 'id'}]}>},
  [],
  {managerId: 'manager_id'}
>;
const rawEmps = dz.sqliteTable('emps', {
  id: dz.integer().primaryKey(),
  managerId: dz.integer('manager_id').references((): dz.AnySQLiteColumn => rawEmps.id),
});

describe('next sqlite columns: same drizzle table on every road', () => {
  it('new builders, shipped builders and raw drizzle materialize the same table', () => {
    expect(project(toDrizzle(users))).toEqual(project(curToDrizzle(curUsers)));
    expect(project(toDrizzle(users))).toEqual(project(rawUsers));
    expect(project(toDrizzle(wide))).toEqual(project(curToDrizzle(curWide)));
    expect(project(toDrizzle(wide))).toEqual(project(rawWide));
  });
  it('a stored generated column keeps its mode', () => {
    const stored = sqliteTable('stored', {derived: text({generatedAlwaysAs: ['x', {mode: 'stored'}]})});
    expect(project(toDrizzle(stored))).toEqual(
      project(dz.sqliteTable('stored', {derived: dz.text().generatedAlwaysAs('x', {mode: 'stored'})}))
    );
  });
  it('the autoIncrement primary key and the rowid reach drizzle', () => {
    const columns = dz.getTableConfig(toDrizzle(users)).columns;
    expect(columns.find((column) => column.name === 'id')).toMatchObject({primary: true, autoIncrement: true, hasDefault: true});
    const plainPk = sqliteTable('plain_pk', {id: integer({primaryKey: true}), key: text({primaryKey: true})});
    expect(project(toDrizzle(plainPk))).toEqual(
      project(dz.sqliteTable('plain_pk', {id: dz.integer().primaryKey(), key: dz.text().primaryKey()}))
    );
  });
  it('tableFromType rebuilds the same table from the hand-written type, db names from the names map', () => {
    expect(project(toDrizzle(tableFromType<Users>()))).toEqual(project(rawUsers));
    expect(project(toDrizzle(tableFromType<Wide>()))).toEqual(project(rawWide));
    expect(tableFromType<Users>()).toBe(tableFromType<Users>());
    expect(toDrizzle<Users>()).toBe(toDrizzle(tableFromType<Users>()));
  });
  it('runtime callbacks ride tableFromType options, as on the shipped road', () => {
    type Runtime = SqliteTable<'runtime_t', {id: Integer<{primaryKey: true}>; slug: Text<{notNull: true; $defaultFn: true}>}>;
    const builders = sqliteTable('runtime_t', {
      id: integer({primaryKey: true}),
      slug: text({notNull: true, $defaultFn: [() => 'b']}),
    });
    const fromType = toDrizzle<Runtime>({runtime: {slug: {$defaultFn: () => 't'}}});
    expect(project(fromType)).toEqual(project(toDrizzle(builders)));
    const slugDefault = (table: unknown) =>
      (dz.getTableConfig(table as never).columns[1] as unknown as {defaultFn: () => unknown}).defaultFn();
    expect([slugDefault(toDrizzle(builders)), slugDefault(fromType)]).toEqual(['b', 't']);
  });
  it('references resolve through tableRef() on builders and through options.tables on types', () => {
    expect(project(toDrizzle(members))).toEqual(project(curToDrizzle(curMembers)));
    const teamsType = tableFromType<Teams>();
    const fromTypes = toDrizzle<Members>({tables: {teams: () => teamsType}});
    expect(project(fromTypes)).toEqual(project(curToDrizzle(curMembers)));
  });
  it('a marker call nested in another marker call gets its own id', () => {
    const fromTypes = toDrizzle<Members>({tables: {teams: () => tableFromType<Teams>()}});
    expect(project(fromTypes)).toEqual(project(curToDrizzle(curMembers)));
  });
  it('a self-reference materializes on both roads', () => {
    expect(project(toDrizzle(emps))).toEqual(project(rawEmps));
    const selfType: object = tableFromType<Emps>({tables: {emps: () => selfType}});
    expect(project(toDrizzle(selfType as Emps))).toEqual(project(rawEmps));
  });
  it('foreignKey takes a tableRef() for the other table', () => {
    const withFk = sqliteTable('with_fk', {teamId: integer('team_id')}, (t) => [
      foreignKey({name: 'fk_team', columns: [t.teamId as never], foreignColumns: [tableRef(teams, 'id')]}),
    ]);
    const curWithFk = cur.sqliteTable('with_fk', {teamId: cur.integer('team_id')}, (t) => [
      cur.foreignKey({name: 'fk_team', columns: [t.teamId], foreignColumns: [curCols(curTeams).id]}),
    ]);
    expect(project(toDrizzle(withFk))).toEqual(project(curToDrizzle(curWithFk)));
  });
  it('the shipped index and constraint helpers work in extraConfig', () => {
    const indexed = sqliteTable('indexed', {a: integer('a', {notNull: true}), b: text('b')}, (t) => [
      cur.index('idx_b').on(t.b),
      cur
        .uniqueIndex('uidx_a')
        .on(t.a)
        .where(sql`a > 0`),
      cur.unique('uq_ab').on(t.a, t.b),
      cur.check('chk_a', sql`a > 0`),
      cur.primaryKey({columns: [t.a, t.b]}),
    ]);
    const curIndexed = cur.sqliteTable('indexed', {a: cur.integer('a').notNull(), b: cur.text('b')}, (t) => [
      cur.index('idx_b').on(t.b),
      cur
        .uniqueIndex('uidx_a')
        .on(t.a)
        .where(sql`a > 0`),
      cur.unique('uq_ab').on(t.a, t.b),
      cur.check('chk_a', sql`a > 0`),
      cur.primaryKey({columns: [t.a, t.b]}),
    ]);
    expect(project(toDrizzle(indexed))).toEqual(project(curToDrizzle(curIndexed)));
  });
  it('a standalone index materializes on its own', () => {
    const entry = cur.index('idx_name').on((users as unknown as Record<string, never>).name);
    const built = toDrizzle(entry) as unknown as {config: {name: string; columns: Array<{name: string}>}};
    expect(built.config.name).toBe('idx_name');
    expect(built.config.columns.map((column) => column.name)).toEqual(['name']);
  });
  it('a reference written without tableRef() fails with an actionable error', () => {
    const loose = sqliteTable('loose', {teamId: integer({references: [() => ({table: 'teams', column: 'id'})]})});
    expect(() => dz.getTableConfig(toDrizzle(loose)).foreignKeys[0]!.reference()).toThrowError(/tableRef\(table, column\)/);
  });
  it('a reference to a missing column fails with an actionable error', () => {
    type Typo = SqliteTable<'typo', {pid: Integer<{references: [{table: 'teams'; column: 'idd'}]}>}>;
    const teamsType = tableFromType<Teams>();
    const typo = toDrizzle(tableFromType<Typo>({tables: {teams: teamsType}}));
    expect(() => dz.getTableConfig(typo).foreignKeys[0]!.reference()).toThrowError(/references no column "idd" in table "teams"/);
  });
});

describe('next sqlite columns: table creators and the columns callback', () => {
  it('sqliteTableCreator maps the table name, like the shipped creator', () => {
    const create = sqliteTableCreator((name) => `app_${name}`);
    const curCreate = cur.sqliteTableCreator((name) => `app_${name}`);
    const table = create('notes', {id: integer({primaryKey: true}), body: text('body_text', {notNull: true})});
    const curTable = curCreate('notes', {id: cur.integer().primaryKey(), body: cur.text('body_text').notNull()});
    expect(project(toDrizzle(table)).name).toBe('app_notes');
    expect(project(toDrizzle(table))).toEqual(project(curToDrizzle(curTable)));
  });
  it('a creator and sqliteTable hand a columns callback the new builders', () => {
    const create = sqliteTableCreator((name) => `app_${name}`);
    const byCallback = create('notes', (helpers) => ({id: helpers.int({primaryKey: true}), body: helpers.text({notNull: true})}));
    const plain = sqliteTable('notes', (helpers) => ({id: helpers.int({primaryKey: true}), body: helpers.text({notNull: true})}));
    const rawColumns = () => ({id: dz.int().primaryKey(), body: dz.text().notNull()});
    expect(project(toDrizzle(plain))).toEqual(project(dz.sqliteTable('notes', rawColumns())));
    expect(project(toDrizzle(byCallback))).toEqual(
      project(dz.sqliteTableCreator((name) => `app_${name}`)('notes', rawColumns()))
    );
  });
});

describe('next sqlite columns: one runtype id for builder and hand-written tables', () => {
  // Marker test coverage rule: both getRunTypeId call shapes, paired.
  it('static form: the table and its models share one id', () => {
    expect(getRunTypeId<Users>()).toBeTruthy();
    expect(getRunTypeId<Users>()).toBe(getRunTypeId<typeof users>());
    expect(getRunTypeId<Wide>()).toBe(getRunTypeId<typeof wide>());
    expect(getRunTypeId<next.InferSelectModel<Users>>()).toBe(getRunTypeId<InferSelectModel<typeof curUsers>>());
    expect(getRunTypeId<next.InferInsertModel<Users>>()).toBe(getRunTypeId<InferInsertModel<typeof curUsers>>());
    expect(getRunTypeId<next.InferInsertModel<Wide>>()).toBe(getRunTypeId<InferInsertModel<typeof curWide>>());
  });
  it('reflection form: the table and its models share one id', () => {
    expect(getRunTypeId(users)).toBe(getRunTypeId<Users>());
    expect(getRunTypeId(wide)).toBe(getRunTypeId<Wide>());
    const row = {} as next.InferSelectModel<typeof users>;
    expect(getRunTypeId(row)).toBe(getRunTypeId<InferSelectModel<typeof curUsers>>());
    const insert = {} as next.InferInsertModel<typeof users>;
    expect(getRunTypeId(insert)).toBe(getRunTypeId<InferInsertModel<typeof curUsers>>());
  });
  it('static form: a TableRef reference reflects as its plain {table, column}', () => {
    expect(getRunTypeId<MembersByRef>()).toBe(getRunTypeId<Members>());
    expect(getRunTypeId<MembersByRef>()).toBe(getRunTypeId<typeof members>());
  });
  it('reflection form: a TableRef reference reflects as its plain {table, column}', () => {
    expect(getRunTypeId(members)).toBe(getRunTypeId<MembersByRef>());
  });
});

describe('next sqlite columns: views and custom types', () => {
  it('a view materializes the same drizzle view as the shipped builders, under both names', () => {
    const query = sql`select user_name from users`;
    const byView = sqliteView('active', {name: text('user_name', {length: 10, notNull: true})}).as(query);
    const byAlias = view('active', {name: text('user_name', {length: 10, notNull: true})}).as(query);
    const curView = cur.sqliteView('active', {name: cur.text('user_name', {length: 10}).notNull()}).as(query);
    expect(projectView(toDrizzle(byView))).toEqual(projectView(curToDrizzle(curView)));
    expect(projectView(toDrizzle(byAlias))).toEqual(projectView(curToDrizzle(curView)));
  });
  it('an existing view materializes as the shipped one does', () => {
    const existing = sqliteView('old', {id: integer({notNull: true})}).existing();
    const curExisting = cur.sqliteView('old', {id: cur.integer().notNull()}).existing();
    expect(projectView(toDrizzle(existing))).toEqual(projectView(curToDrizzle(curExisting)));
  });
  it('a view without columns fails naming the unsupported form', () => {
    expect(() => (sqliteView as (name: string) => unknown)('from_query')).toThrow(/without columns/);
  });
  it('a customType column materializes as the shipped one does', () => {
    const params = {dataType: () => 'text', toDriver: (value: {x: number}) => JSON.stringify(value)};
    const point = customType<{data: {x: number}}>(params);
    const curPoint = cur.customType<{data: {x: number}}>(params);
    const table = sqliteTable('with_custom', {at: point('at_point', {notNull: true})});
    const curTable = cur.sqliteTable('with_custom', {at: curPoint('at_point').notNull()});
    expect(project(toDrizzle(table))).toEqual(project(curToDrizzle(curTable)));
  });
  it('tableFromType refuses a custom column, whose runtime needs the customType callbacks', () => {
    type WithCustom = SqliteTable<'with_custom', {at: CustomCol<{x: number}, {notNull: true}>}>;
    expect(() => tableFromType<WithCustom>()).toThrow(/custom column, which needs its runtime handle/);
  });
});

describe('next sqlite columns: one column shape is one runtype entry', () => {
  // Why columns carry no db name: a shape reused across tables reflects to ONE node.
  const columnId = (table: ReflectedNode, key: string) =>
    table.children!.find((member) => member.name === 'columns')!.child!.children!.find((member) => member.name === key)!.child!
      .id;
  it('the same column in two tables reflects to one id', () => {
    type Orders = SqliteTable<'orders', {total: Integer<{notNull: true}>}, [], {total: 'order_total'}>;
    type Items = SqliteTable<'items', {qty: Integer<{notNull: true}>}>;
    expect(columnId(getRunType<Orders>() as ReflectedNode, 'total')).toBe(columnId(getRunType<Items>() as ReflectedNode, 'qty'));
  });
});

describe('next sqlite columns: builder tables reflect on their own', () => {
  // Chain methods are an endless walk for the runtype id (MKR009): nothing reflected may reach them, alias args included.
  // Each probe is reflected first, with no hand-written twin before it.
  const solo = sqliteTable('solo', {
    id: integer('id', {primaryKey: [{autoIncrement: true}]}),
    name: text('user_name', {length: 20, notNull: true}),
    at: integer('at', {mode: 'timestamp'}),
  });
  const soloView = sqliteView('solo_view', {name: text('user_name', {length: 20, notNull: true})}).existing();
  const soloCreated = sqliteTableCreator((name) => `x_${name}`)('solo_created', {id: int('id', {primaryKey: true})});
  it('a builder table with explicit db names', () => {
    expect(getRunTypeId<typeof solo>()).toBeTruthy();
    expect(getRunTypeId(solo)).toBe(getRunTypeId<typeof solo>());
  });
  it('a builder view', () => {
    expect(getRunTypeId<typeof soloView>()).toBeTruthy();
    expect(getRunTypeId(soloView)).toBe(getRunTypeId<typeof soloView>());
  });
  it('a table creator result', () => {
    expect(getRunTypeId<typeof soloCreated>()).toBeTruthy();
    expect(getRunTypeId(soloCreated)).toBe(getRunTypeId<typeof soloCreated>());
  });
});
