/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// next/ mysql columns at run time, against the shipped builders and raw drizzle.

import {describe, it, expect} from 'vitest';
import * as dz from 'drizzle-orm/mysql-core';
import {getRunType, getRunTypeId} from '@mionjs/run-types';
import type {ReflectedNode} from '../../../drizzle-orm/src/fromType.ts';
import type {InferInsertModel, InferSelectModel} from '../../../drizzle-orm/src/models.ts';
import type * as next from '../../../drizzle-orm/next/index.ts';
import {$type, tableRef, type TableRef} from '../../../drizzle-orm/next/index.ts';
import * as cur from '../../src/index.ts';
import {cols as curCols} from '../../../drizzle-orm/src/table.ts';
import {toDrizzle as curToDrizzle} from '../../src/drizzle.ts';
import type {
  Int,
  Json,
  MysqlEnumCol,
  MysqlEnumObjectCol,
  MysqlTable,
  Serial,
  Text,
  Timestamp,
  Varchar,
} from '../../next/index.ts';
import {
  bigint,
  binary,
  boolean,
  char,
  customType,
  date,
  datetime,
  decimal,
  double,
  float,
  foreignKey,
  int,
  json,
  longtext,
  mediumint,
  mediumtext,
  mysqlEnum,
  mysqlSchema,
  mysqlTable,
  mysqlTableCreator,
  mysqlView,
  real,
  serial,
  smallint,
  tableFromType,
  text,
  time,
  timestamp,
  tinyint,
  tinytext,
  varbinary,
  varchar,
  year,
} from '../../next/index.ts';
import {toDrizzle} from '../../next/drizzle.ts';
import {project, projectView} from '../tableSpecShared.ts';
import {sql} from '../../../drizzle-orm/src/recorder.ts';

const users = mysqlTable('users', {
  id: serial('id', {primaryKey: true}),
  name: varchar('name', {length: 100, notNull: true}),
  age: int('age', {notNull: true, default: [21]}),
  bio: varchar('bio', {length: 500}),
  note: text(),
  createdAt: timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true}),
  touchedAt: timestamp('touched_at', {onUpdateNow: true}),
});
type Users = MysqlTable<
  'users',
  {
    id: Serial<{primaryKey: true}>;
    name: Varchar<{length: 100; notNull: true}>;
    age: Int<{notNull: true; default: [21]}>;
    bio: Varchar<{length: 500}>;
    note: Text;
    createdAt: Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>;
    touchedAt: Timestamp<{onUpdateNow: true}>;
  },
  [],
  {createdAt: 'created_at'; touchedAt: 'touched_at'}
>;
const curUsers = cur.mysqlTable('users', {
  id: cur.serial('id').primaryKey(),
  name: cur.varchar('name', {length: 100}).notNull(),
  age: cur.int('age').notNull().default(21),
  bio: cur.varchar('bio', {length: 500}),
  note: cur.text(),
  createdAt: cur.timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
  touchedAt: cur.timestamp('touched_at').onUpdateNow(),
});
const rawUsers = dz.mysqlTable('users', {
  id: dz.serial('id').primaryKey(),
  name: dz.varchar('name', {length: 100}).notNull(),
  age: dz.int('age').notNull().default(21),
  bio: dz.varchar('bio', {length: 500}),
  note: dz.text(),
  createdAt: dz.timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
  touchedAt: dz.timestamp('touched_at').onUpdateNow(),
});

const wide = mysqlTable('wide', {
  id: serial('id', {primaryKey: true}),
  role: text('role', {enum: ['free', 'pro'], notNull: true}),
  seq: int('seq', {unsigned: true, autoincrement: true}),
  big: bigint('big', {mode: 'bigint', unsigned: true}),
  price: decimal('price', {precision: 10, scale: 2, unsigned: true}),
  level: tinyint('level', {unsigned: true, default: [1]}),
  born: year('born'),
  meta: json('meta', {$type: $type<{tags: string[]}>(), notNull: true}),
  score: int('score', {unique: ['uq_score']}),
  total: int('total', {generatedAlwaysAs: [sql`1 + 1`, {mode: 'stored'}]}),
});
type Wide = MysqlTable<
  'wide',
  {
    id: Serial<{primaryKey: true}>;
    role: Text<{enum: ['free', 'pro']; notNull: true}>;
    seq: Int<{unsigned: true; autoincrement: true}>;
    meta: Json<{$type: [{tags: string[]}]; notNull: true}>;
    score: Int<{unique: ['uq_score']}>;
  }
>;
const curWide = cur.mysqlTable('wide', {
  id: cur.serial('id').primaryKey(),
  role: cur.text('role', {enum: ['free', 'pro']}).notNull(),
  seq: cur.int('seq', {unsigned: true}).autoincrement(),
  big: cur.bigint('big', {mode: 'bigint', unsigned: true}),
  price: cur.decimal('price', {precision: 10, scale: 2, unsigned: true}),
  level: cur.tinyint('level', {unsigned: true}).default(1),
  born: cur.year('born'),
  meta: cur.json('meta').$type<{tags: string[]}>().notNull(),
  score: cur.int('score').unique('uq_score'),
  total: cur.int('total').generatedAlwaysAs(sql`1 + 1`, {mode: 'stored'}),
});
const curWideTyped = cur.mysqlTable('wide', {
  id: cur.serial('id').primaryKey(),
  role: cur.text('role', {enum: ['free', 'pro']}).notNull(),
  seq: cur.int('seq', {unsigned: true}).autoincrement(),
  meta: cur.json('meta').$type<{tags: string[]}>().notNull(),
  score: cur.int('score').unique('uq_score'),
});

const teams = mysqlTable('teams', {id: serial({primaryKey: true})});
const members = mysqlTable('members', {
  id: serial({primaryKey: true}),
  teamId: int('team_id', {references: [() => tableRef(teams, 'id'), {onDelete: 'cascade'}]}),
});
type Teams = MysqlTable<'teams', {id: Serial<{primaryKey: true}>}>;
type Members = MysqlTable<
  'members',
  {id: Serial<{primaryKey: true}>; teamId: Int<{references: [{table: 'teams'; column: 'id'}, {onDelete: 'cascade'}]}>},
  [],
  {teamId: 'team_id'}
>;
type MembersByRef = MysqlTable<
  'members',
  {id: Serial<{primaryKey: true}>; teamId: Int<{references: [TableRef<Teams, 'id'>, {onDelete: 'cascade'}]}>},
  [],
  {teamId: 'team_id'}
>;
const curTeams = cur.mysqlTable('teams', {id: cur.serial().primaryKey()});
const curMembers = cur.mysqlTable('members', {
  id: cur.serial().primaryKey(),
  teamId: cur.int('team_id').references(() => curCols(curTeams).id, {onDelete: 'cascade'}),
});

const emps = mysqlTable('emps', {
  id: serial({primaryKey: true}),
  managerId: int('manager_id', {references: [(): TableRef<'emps', 'id'> => tableRef(emps, 'id')]}),
});
type Emps = MysqlTable<
  'emps',
  {id: Serial<{primaryKey: true}>; managerId: Int<{references: [{table: 'emps'; column: 'id'}]}>},
  [],
  {managerId: 'manager_id'}
>;
const rawEmps = dz.mysqlTable('emps', {
  id: dz.serial().primaryKey(),
  managerId: dz.int('manager_id').references((): dz.AnyMySqlColumn => rawEmps.id),
});

const point = customType<{data: string}>({dataType: () => 'point'});
const curPoint = cur.customType<{data: string}>({dataType: () => 'point'});
const every = mysqlTable('every', {
  bigint: bigint({mode: 'number', unsigned: true}),
  binary: binary({length: 4, notNull: true}),
  boolean: boolean({default: [true]}),
  char: char({length: 3, enum: ['abc', 'def']}),
  date: date({mode: 'string'}),
  datetime: datetime({mode: 'date', fsp: 3}),
  decimal: decimal({precision: 10, scale: 2}),
  double: double({precision: 8, scale: 3, unsigned: true}),
  float: float({autoincrement: true}),
  int: int({unsigned: true}),
  json: json(),
  longtext: longtext({enum: ['a', 'b']}),
  mediumint: mediumint({unsigned: true}),
  mediumtext: mediumtext(),
  real: real({precision: 6, scale: 2}),
  serial: serial(),
  smallint: smallint({unsigned: true}),
  text: text({unique: true}),
  time: time({fsp: 2}),
  timestamp: timestamp({mode: 'string', fsp: 6, defaultNow: true, onUpdateNow: true}),
  tinyint: tinyint(),
  tinytext: tinytext(),
  varbinary: varbinary({length: 16}),
  varchar: varchar({length: 10}),
  year: year(),
  mood: mysqlEnum(['a', 'b']),
  point: point({notNull: true}),
});
const curEvery = cur.mysqlTable('every', {
  bigint: cur.bigint({mode: 'number', unsigned: true}),
  binary: cur.binary({length: 4}).notNull(),
  boolean: cur.boolean().default(true),
  char: cur.char({length: 3, enum: ['abc', 'def']}),
  date: cur.date({mode: 'string'}),
  datetime: cur.datetime({mode: 'date', fsp: 3}),
  decimal: cur.decimal({precision: 10, scale: 2}),
  double: cur.double({precision: 8, scale: 3, unsigned: true}),
  float: cur.float().autoincrement(),
  int: cur.int({unsigned: true}),
  json: cur.json(),
  longtext: cur.longtext({enum: ['a', 'b']}),
  mediumint: cur.mediumint({unsigned: true}),
  mediumtext: cur.mediumtext(),
  real: cur.real({precision: 6, scale: 2}),
  serial: cur.serial(),
  smallint: cur.smallint({unsigned: true}),
  text: cur.text().unique(),
  time: cur.time({fsp: 2}),
  timestamp: cur.timestamp({mode: 'string', fsp: 6}).defaultNow().onUpdateNow(),
  tinyint: cur.tinyint(),
  tinytext: cur.tinytext(),
  varbinary: cur.varbinary({length: 16}),
  varchar: cur.varchar({length: 10}),
  year: cur.year(),
  mood: cur.mysqlEnum(['a', 'b']),
  point: curPoint().notNull(),
});

describe('next mysql columns: same drizzle table on every road', () => {
  it('new builders, shipped builders and raw drizzle materialize the same table', () => {
    expect(project(toDrizzle(users))).toEqual(project(curToDrizzle(curUsers)));
    expect(project(toDrizzle(users))).toEqual(project(rawUsers));
    expect(project(toDrizzle(wide))).toEqual(project(curToDrizzle(curWide)));
  });
  it('every builder materializes as its shipped twin does', () => {
    expect(project(toDrizzle(every))).toEqual(project(curToDrizzle(curEvery)));
    expect(dz.getTableConfig(toDrizzle(every)).columns).toHaveLength(27);
  });
  it('autoincrement and onUpdateNow reach drizzle', () => {
    const config = dz.getTableConfig(toDrizzle(wide));
    expect(config.columns.find((column) => column.name === 'seq')).toMatchObject({autoIncrement: true});
    expect(dz.getTableConfig(toDrizzle(users)).columns.find((column) => column.name === 'touched_at')).toMatchObject({
      hasOnUpdateNow: true,
    });
  });
  it('tableFromType rebuilds the same table from the hand-written type, db names from the names map', () => {
    expect(project(toDrizzle(tableFromType<Users>()))).toEqual(project(rawUsers));
    expect(project(toDrizzle(tableFromType<Wide>()))).toEqual(project(curToDrizzle(curWideTyped)));
    expect(toDrizzle<Users>()).toBe(toDrizzle(tableFromType<Users>()));
  });
  it('tableFromType takes a runtime default from options, and refuses the marker without it', () => {
    type Slugs = MysqlTable<'slugs', {slug: Varchar<{length: 8; primaryKey: true; $defaultFn: true}>}>;
    const curSlugs = cur.mysqlTable('slugs', {
      slug: cur
        .varchar({length: 8})
        .primaryKey()
        .$defaultFn(() => 'x'),
    });
    expect(project(toDrizzle<Slugs>({runtime: {slug: {$defaultFn: () => 'x'}}}))).toEqual(project(curToDrizzle(curSlugs)));
    expect(() => tableFromType<Slugs>()).toThrow(/carries the \$defaultFn marker/);
  });
  it('references resolve through tableRef() on builders and through options.tables on types', () => {
    expect(project(toDrizzle(members))).toEqual(project(curToDrizzle(curMembers)));
    const teamsType = tableFromType<Teams>();
    const fromTypes = toDrizzle<Members>({tables: {teams: () => teamsType}});
    expect(project(fromTypes)).toEqual(project(curToDrizzle(curMembers)));
  });
  it('a tableFromType() nested in toDrizzle() options gets its own id', () => {
    const nested = toDrizzle<MembersByRef>({tables: {teams: () => tableFromType<Teams>()}});
    expect(project(nested)).toEqual(project(curToDrizzle(curMembers)));
  });
  it('a self-reference materializes on both roads', () => {
    expect(project(toDrizzle(emps))).toEqual(project(rawEmps));
    const selfType: object = tableFromType<Emps>({tables: {emps: () => selfType}});
    expect(project(toDrizzle(selfType as Emps))).toEqual(project(rawEmps));
  });
  it('foreignKey takes a tableRef() for the other table', () => {
    const withFk = mysqlTable('with_fk', {teamId: int('team_id')}, (t) => [
      foreignKey({name: 'fk_team', columns: [t.teamId], foreignColumns: [tableRef(teams, 'id')]}).onDelete('cascade'),
    ]);
    const curWithFk = cur.mysqlTable('with_fk', {teamId: cur.int('team_id')}, (t) => [
      cur.foreignKey({name: 'fk_team', columns: [t.teamId], foreignColumns: [curCols(curTeams).id]}).onDelete('cascade'),
    ]);
    expect(project(toDrizzle(withFk))).toEqual(project(curToDrizzle(curWithFk)));
  });
  it('the shipped index helpers work on the new columns, and a standalone index materializes', () => {
    const indexed = mysqlTable('indexed', {name: varchar('name', {length: 20})}, (t) => [
      cur.index('by_name').on(t.name).using('btree').algorithm('inplace'),
    ]);
    const curIndexed = cur.mysqlTable('indexed', {name: cur.varchar('name', {length: 20})}, (t) => [
      cur.index('by_name').on(t.name).using('btree').algorithm('inplace'),
    ]);
    expect(project(toDrizzle(indexed))).toEqual(project(curToDrizzle(curIndexed)));
    const standalone = cur.index('solo_name').on(curCols(curIndexed).name);
    expect(toDrizzle(standalone)).toBeInstanceOf(dz.IndexBuilder);
  });
  it('a reference written without tableRef() fails with an actionable error', () => {
    const loose = mysqlTable('loose', {teamId: int({references: [() => ({table: 'teams', column: 'id'})]})});
    expect(() => dz.getTableConfig(toDrizzle(loose)).foreignKeys[0]!.reference()).toThrowError(/tableRef\(table, column\)/);
  });
  it('a reference to a missing column fails with an actionable error', () => {
    type Typo = MysqlTable<'typo', {pid: Int<{references: [{table: 'teams'; column: 'idd'}]}>}>;
    const teamsType = tableFromType<Teams>();
    const typo = toDrizzle(tableFromType<Typo>({tables: {teams: teamsType}}));
    expect(() => dz.getTableConfig(typo).foreignKeys[0]!.reference()).toThrowError(/references no column "idd" in table "teams"/);
  });
  it('a type reference with no table passed fails with an actionable error', () => {
    expect(() => tableFromType<Members>({})).toThrow(/pass it via tableFromType options: \{tables: \{teams: \.\.\.\}\}/);
  });
});

describe('next mysql columns: schemas and table creators', () => {
  it('mysqlSchema tables and views materialize schema-qualified, like the shipped ones', () => {
    const shop = mysqlSchema('shop');
    const curShop = cur.mysqlSchema('shop');
    const items = shop.table('items', {id: serial({primaryKey: true}), label: varchar('item_label', {length: 20})});
    const curItems = curShop.table('items', {id: cur.serial().primaryKey(), label: cur.varchar('item_label', {length: 20})});
    expect(project(toDrizzle(items))).toEqual(project(curToDrizzle(curItems)));
    expect(dz.getTableConfig(toDrizzle(items)).schema).toBe('shop');
    const view = shop.view('item_view', {label: varchar({length: 20})}).as(sql`select label from items`);
    const curView = curShop.view('item_view', {label: cur.varchar({length: 20})}).as(sql`select label from items`);
    expect(projectView(toDrizzle(view))).toEqual(projectView(curToDrizzle(curView)));
    expect(dz.getViewConfig(toDrizzle(view)).schema).toBe('shop');
    expect(toDrizzle(shop)).toBeInstanceOf(dz.MySqlSchema);
  });
  it('a schema table takes the columns callback too', () => {
    const shop = mysqlSchema('shop');
    const byCallback = shop.table('things', (helpers) => ({
      id: helpers.int({primaryKey: true}),
      mood: helpers.mysqlEnum(['a', 'b']),
    }));
    const rawThings = dz.mysqlSchema('shop').table('things', {id: dz.int().primaryKey(), mood: dz.mysqlEnum(['a', 'b'])});
    expect(project(toDrizzle(byCallback))).toEqual(project(rawThings));
  });
  it('mysqlTableCreator maps the table name, like raw drizzle', () => {
    const prefixed = mysqlTableCreator((name) => `app_${name}`);
    const rawPrefixed = dz.mysqlTableCreator((name) => `app_${name}`);
    const items = prefixed('items', (helpers) => ({id: helpers.serial({primaryKey: true}), note: helpers.text({notNull: true})}));
    const rawItems = rawPrefixed('items', {id: dz.serial().primaryKey(), note: dz.text().notNull()});
    expect(project(toDrizzle(items))).toEqual(project(rawItems));
    expect(dz.getTableConfig(toDrizzle(items)).name).toBe('app_items');
  });
});

describe('next mysql columns: one runtype id for builder and hand-written tables', () => {
  // Marker test coverage rule: both getRunTypeId call shapes, paired.
  it('static form: the table and its models share one id', () => {
    expect(getRunTypeId<Users>()).toBeTruthy();
    expect(getRunTypeId<Users>()).toBe(getRunTypeId<typeof users>());
    expect(getRunTypeId<next.InferSelectModel<Users>>()).toBe(getRunTypeId<InferSelectModel<typeof curUsers>>());
    expect(getRunTypeId<next.InferInsertModel<Wide>>()).toBe(getRunTypeId<InferInsertModel<typeof curWideTyped>>());
  });
  it('reflection form: the table and its models share one id', () => {
    expect(getRunTypeId(users)).toBeTruthy();
    expect(getRunTypeId(users)).toBe(getRunTypeId<Users>());
    const row = {} as next.InferSelectModel<typeof users>;
    expect(getRunTypeId(row)).toBeTruthy();
    expect(getRunTypeId(row)).toBe(getRunTypeId<InferSelectModel<typeof curUsers>>());
    const insert = {} as next.InferInsertModel<Wide>;
    expect(getRunTypeId(insert)).toBe(getRunTypeId<InferInsertModel<typeof curWideTyped>>());
  });
  it('static form: a TableRef reference reflects as its plain {table, column}', () => {
    expect(getRunTypeId<MembersByRef>()).toBe(getRunTypeId<Members>());
    expect(getRunTypeId<MembersByRef>()).toBe(getRunTypeId<typeof members>());
  });
  it('reflection form: a TableRef reference reflects as its plain {table, column}', () => {
    expect(getRunTypeId(members)).toBeTruthy();
    expect(getRunTypeId(members)).toBe(getRunTypeId<MembersByRef>());
  });
});

describe('next mysql columns: views and enums', () => {
  it('a view with its mysql options materializes the same drizzle view as the shipped builders', () => {
    const view = mysqlView('active', {name: varchar('user_name', {length: 10, notNull: true})})
      .algorithm('merge')
      .sqlSecurity('invoker')
      .withCheckOption('cascaded')
      .as(sql`select user_name from users`);
    const curView = cur
      .mysqlView('active', {name: cur.varchar('user_name', {length: 10}).notNull()})
      .algorithm('merge')
      .sqlSecurity('invoker')
      .withCheckOption('cascaded')
      .as(sql`select user_name from users`);
    expect(projectView(toDrizzle(view))).toEqual(projectView(curToDrizzle(curView)));
    expect(dz.getViewConfig(toDrizzle(view))).toMatchObject({
      algorithm: 'merge',
      sqlSecurity: 'invoker',
      withCheckOption: 'cascaded',
    });
  });
  it('an existing view materializes as the shipped one does', () => {
    const view = mysqlView('existing_view', {id: int({notNull: true})}).existing();
    const curView = cur.mysqlView('existing_view', {id: cur.int().notNull()}).existing();
    expect(projectView(toDrizzle(view))).toEqual(projectView(curToDrizzle(curView)));
  });
  it('enum columns, tuple and object forms, materialize as the shipped ones do', () => {
    const table = mysqlTable('with_enum', {
      mood: mysqlEnum('mood', ['sad', 'happy'], {notNull: true}),
      level: mysqlEnum({Low: 'low', High: 'high'} as const, {default: ['low']}),
      bare: mysqlEnum(['x', 'y']),
    });
    const curTable = cur.mysqlTable('with_enum', {
      mood: cur.mysqlEnum('mood', ['sad', 'happy']).notNull(),
      level: cur.mysqlEnum({Low: 'low', High: 'high'} as const).default('low'),
      bare: cur.mysqlEnum(['x', 'y']),
    });
    expect(project(toDrizzle(table))).toEqual(project(curToDrizzle(curTable)));
  });
  it('tableFromType refuses an enum column, whose runtime needs the enum values', () => {
    type WithEnum = MysqlTable<'with_enum', {mood: MysqlEnumCol<['sad', 'happy'], {notNull: true}>}>;
    type WithEnumObject = MysqlTable<'with_enum', {mood: MysqlEnumObjectCol<{Sad: 'sad'}>}>;
    expect(() => tableFromType<WithEnum>()).toThrow(/enum column, which needs its runtime handle/);
    expect(() => tableFromType<WithEnumObject>()).toThrow(/enum column, which needs its runtime handle/);
  });
});

describe('next mysql columns: one column shape is one runtype entry', () => {
  // Why columns carry no db name: a shape reused across tables reflects to ONE node.
  const columnId = (table: ReflectedNode, key: string) =>
    table.children!.find((member) => member.name === 'columns')!.child!.children!.find((member) => member.name === key)!.child!
      .id;
  it('the same column in two tables reflects to one id', () => {
    type Orders = MysqlTable<'orders', {total: Int<{notNull: true}>}, [], {total: 'order_total'}>;
    type Items = MysqlTable<'items', {qty: Int<{notNull: true}>}>;
    expect(columnId(getRunType<Orders>() as ReflectedNode, 'total')).toBe(columnId(getRunType<Items>() as ReflectedNode, 'qty'));
  });
});

describe('next mysql columns: builder tables reflect on their own', () => {
  // Chain methods are an endless walk for the runtype id (MKR009): nothing reflected may reach them, alias args included.
  // Each probe is reflected first, with no hand-written twin before it.
  const solo = mysqlTable('solo', {
    id: serial('id', {primaryKey: true}),
    name: varchar('user_name', {length: 20, notNull: true}),
    seq: int({unsigned: true, autoincrement: true}),
    touchedAt: timestamp('touched_at', {onUpdateNow: true}),
  });
  const soloView = mysqlView('solo_view', {name: varchar('user_name', {length: 20, notNull: true})})
    .algorithm('merge')
    .existing();
  const soloSchemaTable = mysqlSchema('solo_schema').table('solo_items', {label: varchar('item_label', {length: 20})});
  it('a builder table with explicit db names', () => {
    expect(getRunTypeId<typeof solo>()).toBeTruthy();
    expect(getRunTypeId(solo)).toBe(getRunTypeId<typeof solo>());
  });
  it('a builder view', () => {
    expect(getRunTypeId<typeof soloView>()).toBeTruthy();
    expect(getRunTypeId(soloView)).toBe(getRunTypeId<typeof soloView>());
  });
  it('a schema builder table', () => {
    expect(getRunTypeId<typeof soloSchemaTable>()).toBeTruthy();
    expect(getRunTypeId(soloSchemaTable)).toBe(getRunTypeId<typeof soloSchemaTable>());
  });
});
