/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// next/ pg columns at run time, against the shipped builders and raw drizzle.

import {describe, it, expect} from 'vitest';
import {sql as dzSql} from 'drizzle-orm';
import * as dz from 'drizzle-orm/pg-core';
import {getRunType, getRunTypeId} from '@mionjs/run-types';
import type {ReflectedNode} from '../../../drizzle-orm/src/fromType.ts';
import type {InferInsertModel, InferSelectModel} from '../../../drizzle-orm/src/models.ts';
import type * as next from '../../../drizzle-orm/next/index.ts';
import {$type, tableRef, type TableRef} from '../../../drizzle-orm/next/index.ts';
import * as cur from '../../src/index.ts';
import {cols as curCols} from '../../../drizzle-orm/src/table.ts';
import {toDrizzle as curToDrizzle} from '../../src/drizzle.ts';
import type {
  CustomCol,
  Integer,
  Jsonb,
  PgEnumCol,
  PgEnumObjectCol,
  PgTable,
  Serial,
  Text,
  Timestamp,
  Uuid,
  Varchar,
} from '../../next/index.ts';
import {
  bigint,
  bigserial,
  bit,
  boolean,
  char,
  cidr,
  customType,
  date,
  decimal,
  doublePrecision,
  foreignKey,
  geometry,
  halfvec,
  inet,
  integer,
  interval,
  json,
  jsonb,
  line,
  macaddr,
  macaddr8,
  numeric,
  pgEnum,
  pgMaterializedView,
  pgSchema,
  pgTable,
  pgTableCreator,
  pgView,
  point,
  real,
  serial,
  smallint,
  smallserial,
  sparsevec,
  tableFromType,
  text,
  time,
  timestamp,
  uuid,
  varchar,
  vector,
} from '../../next/index.ts';
import {toDrizzle} from '../../next/drizzle.ts';
import {project, projectView} from '../tableSpecShared.ts';
import {sql} from '../../../drizzle-orm/src/recorder.ts';

const users = pgTable('users', {
  id: uuid('id', {primaryKey: true, defaultRandom: true}),
  name: varchar('name', {length: 100, notNull: true}),
  age: integer('age', {notNull: true, default: [21]}),
  bio: varchar('bio', {length: 500}),
  note: varchar(),
  createdAt: timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true}),
});
type Users = PgTable<
  'users',
  {
    id: Uuid<{primaryKey: true; defaultRandom: true}>;
    name: Varchar<{length: 100; notNull: true}>;
    age: Integer<{notNull: true; default: [21]}>;
    bio: Varchar<{length: 500}>;
    note: Varchar;
    createdAt: Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>;
  },
  [],
  {createdAt: 'created_at'}
>;
const curUsers = cur.pgTable('users', {
  id: cur.uuid('id').primaryKey().defaultRandom(),
  name: cur.varchar('name', {length: 100}).notNull(),
  age: cur.integer('age').notNull().default(21),
  bio: cur.varchar('bio', {length: 500}),
  note: cur.varchar(),
  createdAt: cur.timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});
const rawUsers = dz.pgTable('users', {
  id: dz.uuid('id').primaryKey().defaultRandom(),
  name: dz.varchar('name', {length: 100}).notNull(),
  age: dz.integer('age').notNull().default(21),
  bio: dz.varchar('bio', {length: 500}),
  note: dz.varchar(),
  createdAt: dz.timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});

const wide = pgTable('wide', {
  id: serial('id', {primaryKey: true}),
  role: text('role', {enum: ['free', 'pro'], notNull: true}),
  seq: integer('seq', {generatedAlwaysAsIdentity: true}),
  tags: text('tags', {array: true, notNull: true}),
  meta: jsonb('meta', {$type: $type<{tags: string[]}>(), notNull: true}),
  score: integer('score', {unique: ['uq_score']}),
});
type Wide = PgTable<
  'wide',
  {
    id: Serial<{primaryKey: true}>;
    role: Text<{enum: ['free', 'pro']; notNull: true}>;
    seq: Integer<{generatedAlwaysAsIdentity: true}>;
    tags: Text<{array: true; notNull: true}>;
    meta: Jsonb<{$type: [{tags: string[]}]; notNull: true}>;
    score: Integer<{unique: ['uq_score']}>;
  }
>;
const curWide = cur.pgTable('wide', {
  id: cur.serial('id').primaryKey(),
  role: cur.text('role', {enum: ['free', 'pro']}).notNull(),
  seq: cur.integer('seq').generatedAlwaysAsIdentity(),
  tags: cur.text('tags').array().notNull(),
  meta: cur.jsonb('meta').$type<{tags: string[]}>().notNull(),
  score: cur.integer('score').unique('uq_score'),
});
const rawWide = dz.pgTable('wide', {
  id: dz.serial('id').primaryKey(),
  role: dz.text('role', {enum: ['free', 'pro']}).notNull(),
  seq: dz.integer('seq').generatedAlwaysAsIdentity(),
  tags: dz.text('tags').array().notNull(),
  meta: dz.jsonb('meta').$type<{tags: string[]}>().notNull(),
  score: dz.integer('score').unique('uq_score'),
});

const teams = pgTable('teams', {id: serial({primaryKey: true})});
const members = pgTable('members', {
  id: serial({primaryKey: true}),
  teamId: integer('team_id', {references: [() => tableRef(teams, 'id'), {onDelete: 'cascade'}]}),
});
type Teams = PgTable<'teams', {id: Serial<{primaryKey: true}>}>;
type Members = PgTable<
  'members',
  {id: Serial<{primaryKey: true}>; teamId: Integer<{references: [{table: 'teams'; column: 'id'}, {onDelete: 'cascade'}]}>},
  [],
  {teamId: 'team_id'}
>;
type MembersByRef = PgTable<
  'members',
  {id: Serial<{primaryKey: true}>; teamId: Integer<{references: [TableRef<Teams, 'id'>, {onDelete: 'cascade'}]}>},
  [],
  {teamId: 'team_id'}
>;
const curTeams = cur.pgTable('teams', {id: cur.serial().primaryKey()});
const curMembers = cur.pgTable('members', {
  id: cur.serial().primaryKey(),
  teamId: cur.integer('team_id').references(() => curCols(curTeams).id, {onDelete: 'cascade'}),
});

const emps = pgTable('emps', {
  id: serial({primaryKey: true}),
  managerId: integer('manager_id', {references: [(): TableRef<'emps', 'id'> => tableRef(emps, 'id')]}),
});
type Emps = PgTable<
  'emps',
  {id: Serial<{primaryKey: true}>; managerId: Integer<{references: [{table: 'emps'; column: 'id'}]}>},
  [],
  {managerId: 'manager_id'}
>;
const rawEmps = dz.pgTable('emps', {
  id: dz.serial().primaryKey(),
  managerId: dz.integer('manager_id').references((): dz.AnyPgColumn => rawEmps.id),
});

const citext = customType<{data: string}>({dataType: () => 'citext'});
const curCitext = cur.customType<{data: string}>({dataType: () => 'citext'});
const everyMood = pgEnum('every_mood', ['a', 'b']);
const curEveryMood = cur.pgEnum('every_mood', ['a', 'b']);
const every = pgTable('every', {
  bigint: bigint({mode: 'bigint'}),
  bigserial: bigserial({mode: 'number'}),
  bit: bit({dimensions: 8}),
  boolean: boolean({default: [true]}),
  char: char({length: 3, enum: ['abc', 'def']}),
  cidr: cidr(),
  date: date({mode: 'date'}),
  decimal: decimal({precision: 10, scale: 2}),
  doublePrecision: doublePrecision(),
  geometry: geometry({type: 'point', mode: 'xy', srid: 4326}),
  halfvec: halfvec({dimensions: 3}),
  inet: inet(),
  integer: integer({notNull: true}),
  interval: interval({fields: 'day', precision: 2}),
  json: json(),
  jsonb: jsonb(),
  line: line({mode: 'abc'}),
  macaddr: macaddr(),
  macaddr8: macaddr8(),
  numeric: numeric({mode: 'number', precision: 8}),
  point: point({mode: 'xy'}),
  real: real(),
  serial: serial(),
  smallint: smallint({generatedByDefaultAsIdentity: true}),
  smallserial: smallserial(),
  sparsevec: sparsevec({dimensions: 5}),
  text: text({unique: true}),
  time: time({precision: 3, withTimezone: true}),
  timestamp: timestamp({mode: 'string', precision: 6, withTimezone: true}),
  uuid: uuid({defaultRandom: true}),
  varchar: varchar({length: 10}),
  vector: vector({dimensions: 3}),
  mood: everyMood(),
  citext: citext({notNull: true}),
});
const curEvery = cur.pgTable('every', {
  bigint: cur.bigint({mode: 'bigint'}),
  bigserial: cur.bigserial({mode: 'number'}),
  bit: cur.bit({dimensions: 8}),
  boolean: cur.boolean().default(true),
  char: cur.char({length: 3, enum: ['abc', 'def']}),
  cidr: cur.cidr(),
  date: cur.date({mode: 'date'}),
  decimal: cur.decimal({precision: 10, scale: 2}),
  doublePrecision: cur.doublePrecision(),
  geometry: cur.geometry({type: 'point', mode: 'xy', srid: 4326}),
  halfvec: cur.halfvec({dimensions: 3}),
  inet: cur.inet(),
  integer: cur.integer().notNull(),
  interval: cur.interval({fields: 'day', precision: 2}),
  json: cur.json(),
  jsonb: cur.jsonb(),
  line: cur.line({mode: 'abc'}),
  macaddr: cur.macaddr(),
  macaddr8: cur.macaddr8(),
  numeric: cur.numeric({mode: 'number', precision: 8}),
  point: cur.point({mode: 'xy'}),
  real: cur.real(),
  serial: cur.serial(),
  smallint: cur.smallint().generatedByDefaultAsIdentity(),
  smallserial: cur.smallserial(),
  sparsevec: cur.sparsevec({dimensions: 5}),
  text: cur.text().unique(),
  time: cur.time({precision: 3, withTimezone: true}),
  timestamp: cur.timestamp({mode: 'string', precision: 6, withTimezone: true}),
  uuid: cur.uuid().defaultRandom(),
  varchar: cur.varchar({length: 10}),
  vector: cur.vector({dimensions: 3}),
  mood: curEveryMood(),
  citext: curCitext().notNull(),
});

describe('next pg columns: same drizzle table on every road', () => {
  it('new builders, shipped builders and raw drizzle materialize the same table', () => {
    expect(project(toDrizzle(users))).toEqual(project(curToDrizzle(curUsers)));
    expect(project(toDrizzle(users))).toEqual(project(rawUsers));
    expect(project(toDrizzle(wide))).toEqual(project(curToDrizzle(curWide)));
    expect(project(toDrizzle(wide))).toEqual(project(rawWide));
  });
  it('every builder materializes as its shipped twin does', () => {
    expect(project(toDrizzle(every))).toEqual(project(curToDrizzle(curEvery)));
    expect(dz.getTableConfig(toDrizzle(every)).columns).toHaveLength(34);
  });
  it('the dialect modifiers reach drizzle', () => {
    const modded = pgTable('modded', {
      always: integer({generatedAlwaysAsIdentity: [{startWith: 10}]}),
      byDefault: bigint({mode: 'number', generatedByDefaultAsIdentity: true}),
      tags: text({array: true}),
      grid: integer({array: [3]}),
      key: uuid({defaultRandom: true}),
      at: timestamp({defaultNow: true}),
    });
    const byName = (name: string) => dz.getTableConfig(toDrizzle(modded)).columns.find((column) => column.name === name)!;
    expect(byName('always')).toMatchObject({generatedIdentity: {type: 'always'}, notNull: true});
    expect(byName('byDefault')).toMatchObject({generatedIdentity: {type: 'byDefault'}});
    expect(byName('tags').getSQLType()).toBe('text[]');
    expect(byName('grid').getSQLType()).toBe('integer[3]');
    expect(byName('key')).toMatchObject({hasDefault: true});
    expect(byName('at')).toMatchObject({hasDefault: true});
  });
  it('a generated column keeps its config', () => {
    const generated = pgTable('generated', {total: integer({generatedAlwaysAs: [sql`1 + 1`]})});
    const rawGenerated = dz.pgTable('generated', {total: dz.integer().generatedAlwaysAs(dzSql`1 + 1`)});
    expect(project(toDrizzle(generated))).toEqual(project(rawGenerated));
    expect(dz.getTableConfig(toDrizzle(generated)).columns[0]).toMatchObject({generated: {type: 'always', mode: 'stored'}});
  });
  it('tableFromType rebuilds the same table from the hand-written type, db names from the names map', () => {
    expect(project(toDrizzle(tableFromType<Users>()))).toEqual(project(rawUsers));
    expect(project(toDrizzle(tableFromType<Wide>()))).toEqual(project(rawWide));
    expect(tableFromType<Users>()).toBe(tableFromType<Users>());
    expect(toDrizzle<Users>()).toBe(toDrizzle<Users>());
    expect(toDrizzle<Users>()).toBe(toDrizzle(tableFromType<Users>()));
  });
  it('tableFromType takes runtime callbacks from options, and refuses a marker without one', () => {
    type Slugs = PgTable<'slugs', {slug: Varchar<{length: 8; primaryKey: true; $defaultFn: true}>}>;
    const curSlugs = cur.pgTable('slugs', {
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
    const withFk = pgTable('with_fk', {teamId: integer('team_id')}, (t) => [
      foreignKey({name: 'fk_team', columns: [t.teamId], foreignColumns: [tableRef(teams, 'id')]}).onDelete('cascade'),
    ]);
    const curWithFk = cur.pgTable('with_fk', {teamId: cur.integer('team_id')}, (t) => [
      cur.foreignKey({name: 'fk_team', columns: [t.teamId], foreignColumns: [curCols(curTeams).id]}).onDelete('cascade'),
    ]);
    expect(project(toDrizzle(withFk))).toEqual(project(curToDrizzle(curWithFk)));
  });
  it('the shipped index and constraint helpers work in extraConfig', () => {
    const indexed = pgTable('indexed', {a: integer('a', {notNull: true}), b: text('b')}, (t) => [
      cur.index('idx_b').using('btree', t.b),
      cur
        .uniqueIndex('uidx_a')
        .on(t.a)
        .where(sql`a > 0`),
      cur.unique('uq_ab').on(t.a, t.b),
      cur.check('chk_a', sql`a > 0`),
      cur.primaryKey({columns: [t.a, t.b]}),
    ]);
    const curIndexed = cur.pgTable('indexed', {a: cur.integer('a').notNull(), b: cur.text('b')}, (t) => [
      cur.index('idx_b').using('btree', t.b),
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
    // drizzle's pg index clones an extraConfig column, so outside one it takes an expression, as raw drizzle does.
    const standalone = cur.index('solo_name').on(sql`lower(name)`);
    const built = toDrizzle(standalone);
    expect(built).toBeInstanceOf(dz.IndexBuilder);
    expect((built as unknown as {config: object}).config).toMatchObject({name: 'solo_name', columns: [expect.anything()]});
  });
  it('a reference written without tableRef() fails with an actionable error', () => {
    const loose = pgTable('loose', {teamId: integer({references: [() => ({table: 'teams', column: 'id'})]})});
    expect(() => dz.getTableConfig(toDrizzle(loose)).foreignKeys[0]!.reference()).toThrowError(/tableRef\(table, column\)/);
  });
  it('a reference to a missing column fails with an actionable error', () => {
    type Typo = PgTable<'typo', {pid: Integer<{references: [{table: 'teams'; column: 'idd'}]}>}>;
    const teamsType = tableFromType<Teams>();
    const typo = toDrizzle(tableFromType<Typo>({tables: {teams: teamsType}}));
    expect(() => dz.getTableConfig(typo).foreignKeys[0]!.reference()).toThrowError(/references no column "idd" in table "teams"/);
  });
  it('a type reference with no table passed fails with an actionable error', () => {
    expect(() => tableFromType<Members>({})).toThrow(/pass it via tableFromType options: \{tables: \{teams: \.\.\.\}\}/);
  });
});

describe('next pg columns: table creators and the columns callback', () => {
  it('the table creator maps the table name like raw drizzle', () => {
    const create = pgTableCreator((name) => `app_${name}`);
    const curCreate = cur.pgTableCreator((name) => `app_${name}`);
    const rawCreate = dz.pgTableCreator((name) => `app_${name}`);
    const table = create('notes', {id: serial({primaryKey: true}), body: text('body_text', {notNull: true})});
    const curTable = curCreate('notes', {id: cur.serial().primaryKey(), body: cur.text('body_text').notNull()});
    const rawTable = rawCreate('notes', {id: dz.serial().primaryKey(), body: dz.text('body_text').notNull()});
    expect(project(toDrizzle(table)).name).toBe('app_notes');
    expect(project(toDrizzle(table))).toEqual(project(rawTable));
    expect(project(toDrizzle(table))).toEqual(project(curToDrizzle(curTable)));
  });
  it('the table builder and the table creator hand a columns callback the new builders', () => {
    const create = pgTableCreator((name) => `app_${name}`);
    const byCallback = create('notes', (helpers) => ({
      id: helpers.serial({primaryKey: true}),
      body: helpers.text({notNull: true}),
    }));
    const plain = pgTable('notes', (helpers) => ({id: helpers.serial({primaryKey: true}), body: helpers.text({notNull: true})}));
    const rawColumns = () => ({id: dz.serial().primaryKey(), body: dz.text().notNull()});
    expect(project(toDrizzle(plain))).toEqual(project(dz.pgTable('notes', rawColumns())));
    expect(project(toDrizzle(byCallback))).toEqual(project(dz.pgTableCreator((name) => `app_${name}`)('notes', rawColumns())));
  });
});

describe('next pg columns: only pg, mysql: schemas', () => {
  it('schema tables and views materialize schema-qualified, and toDrizzle(schema) too', () => {
    const shop = pgSchema('shop');
    const curShop = cur.pgSchema('shop');
    const items = shop.table('items', {id: serial({primaryKey: true}), label: varchar('item_label', {length: 20})});
    const curItems = curShop.table('items', {id: cur.serial().primaryKey(), label: cur.varchar('item_label', {length: 20})});
    expect(project(toDrizzle(items))).toEqual(project(curToDrizzle(curItems)));
    expect(dz.getTableConfig(toDrizzle(items)).schema).toBe('shop');
    const view = shop.view('item_view', {label: varchar({length: 20})}).as(sql`select label from items`);
    const curView = curShop.view('item_view', {label: cur.varchar({length: 20})}).as(sql`select label from items`);
    expect(projectView(toDrizzle(view), false)).toEqual(projectView(curToDrizzle(curView), false));
    expect(dz.getViewConfig(toDrizzle(view)).schema).toBe('shop');
    const materialized = shop.materializedView('item_mview', {label: varchar({length: 20})}).existing();
    const curMaterialized = curShop.materializedView('item_mview', {label: cur.varchar({length: 20})}).existing();
    expect(projectView(toDrizzle(materialized), true)).toEqual(projectView(curToDrizzle(curMaterialized), true));
    expect(toDrizzle(shop)).toBeInstanceOf(dz.PgSchema);
  });
  it('a schema table takes the columns callback too', () => {
    const shop = pgSchema('shop');
    const byCallback = shop.table('things', (helpers) => ({
      id: helpers.integer({primaryKey: true}),
      note: helpers.text({notNull: true}),
    }));
    const rawThings = dz.pgSchema('shop').table('things', {id: dz.integer().primaryKey(), note: dz.text().notNull()});
    expect(project(toDrizzle(byCallback))).toEqual(project(rawThings));
  });
  it('only pg: schema enums and sequences materialize like the shipped ones', () => {
    const shop = pgSchema('shop');
    const curShop = cur.pgSchema('shop');
    const status = shop.enum('status', ['on', 'off']);
    const curStatus = curShop.enum('status', ['on', 'off']);
    const flags = shop.table('flags', {status: status('state', {notNull: true})});
    const curFlags = curShop.table('flags', {status: curStatus('state').notNull()});
    expect(project(toDrizzle(flags))).toEqual(project(curToDrizzle(curFlags)));
    const dzStatus = toDrizzle(status);
    expect([dzStatus.enumName, dzStatus.enumValues, dzStatus.schema]).toEqual(['status', ['on', 'off'], 'shop']);
    const ids = shop.sequence('ids', {startWith: 10});
    const curIds = curShop.sequence('ids', {startWith: 10});
    expect(toDrizzle(ids)).toEqual(curToDrizzle(curIds));
    expect(toDrizzle(ids)).toMatchObject({seqName: 'ids', schema: 'shop', seqOptions: {startWith: 10}});
  });
});

describe('next pg columns: one runtype id for builder and hand-written tables', () => {
  // Marker test coverage rule: both getRunTypeId call shapes, paired.
  it('static form: the table and its models share one id', () => {
    expect(getRunTypeId<Users>()).toBeTruthy();
    expect(getRunTypeId<Users>()).toBe(getRunTypeId<typeof users>());
    expect(getRunTypeId<next.InferSelectModel<Users>>()).toBeTruthy();
    expect(getRunTypeId<next.InferSelectModel<Users>>()).toBe(getRunTypeId<InferSelectModel<typeof curUsers>>());
    expect(getRunTypeId<next.InferInsertModel<Wide>>()).toBeTruthy();
    expect(getRunTypeId<next.InferInsertModel<Wide>>()).toBe(getRunTypeId<InferInsertModel<typeof curWide>>());
  });
  it('reflection form: the table and its models share one id', () => {
    expect(getRunTypeId(users)).toBeTruthy();
    expect(getRunTypeId(users)).toBe(getRunTypeId<Users>());
    const row = {} as next.InferSelectModel<typeof users>;
    expect(getRunTypeId(row)).toBeTruthy();
    expect(getRunTypeId(row)).toBe(getRunTypeId<InferSelectModel<typeof curUsers>>());
    const insert = {} as next.InferInsertModel<Wide>;
    expect(getRunTypeId(insert)).toBeTruthy();
    expect(getRunTypeId(insert)).toBe(getRunTypeId<InferInsertModel<typeof curWide>>());
  });
  it('static form: a TableRef reference reflects as its plain {table, column}', () => {
    expect(getRunTypeId<MembersByRef>()).toBeTruthy();
    expect(getRunTypeId<MembersByRef>()).toBe(getRunTypeId<Members>());
    expect(getRunTypeId<MembersByRef>()).toBe(getRunTypeId<typeof members>());
  });
  it('reflection form: a TableRef reference reflects as its plain {table, column}', () => {
    expect(getRunTypeId(members)).toBeTruthy();
    expect(getRunTypeId(members)).toBe(getRunTypeId<MembersByRef>());
  });
});

describe('next pg columns: views, enums and custom types', () => {
  it('a view materializes the same drizzle view as the shipped builders', () => {
    const view = pgView('active', {name: varchar('user_name', {length: 10, notNull: true})}).as(sql`select user_name from users`);
    const curView = cur
      .pgView('active', {name: cur.varchar('user_name', {length: 10}).notNull()})
      .as(sql`select user_name from users`);
    expect(projectView(toDrizzle(view), false)).toEqual(projectView(curToDrizzle(curView), false));
  });
  it('an existing view materializes as the shipped one does', () => {
    const view = pgView('existing_view', {id: integer({notNull: true})}).existing();
    const curView = cur.pgView('existing_view', {id: cur.integer().notNull()}).existing();
    expect(projectView(toDrizzle(view), false)).toEqual(projectView(curToDrizzle(curView), false));
  });
  it('a view without columns fails naming the unsupported form', () => {
    expect(() => (pgView as (name: string) => unknown)('from_query')).toThrow(/without columns/);
    expect(() => (pgMaterializedView as (name: string) => unknown)('from_query')).toThrow(/without columns/);
  });
  it('a customType column materializes as the shipped one does', () => {
    const params = {dataType: () => 'text', toDriver: (value: {x: number}) => JSON.stringify(value)};
    const custom = customType<{data: {x: number}}>(params);
    const curCustom = cur.customType<{data: {x: number}}>(params);
    const table = pgTable('with_custom', {at: custom('at_point', {notNull: true})});
    const curTable = cur.pgTable('with_custom', {at: curCustom('at_point').notNull()});
    expect(project(toDrizzle(table))).toEqual(project(curToDrizzle(curTable)));
  });
  it('tableFromType refuses a custom column, whose runtime needs the customType callbacks', () => {
    type WithCustom = PgTable<'with_custom', {at: CustomCol<{x: number}, {notNull: true}>}>;
    expect(() => tableFromType<WithCustom>()).toThrow(/custom column, which needs its runtime handle/);
  });
  it('only pg, mysql: view options materialize as the shipped ones do', () => {
    const view = pgView('secure', {name: varchar('user_name', {length: 10})})
      .with({securityBarrier: true, checkOption: 'cascaded'})
      .as(sql`select user_name from users`);
    const curView = cur
      .pgView('secure', {name: cur.varchar('user_name', {length: 10})})
      .with({securityBarrier: true, checkOption: 'cascaded'})
      .as(sql`select user_name from users`);
    expect(projectView(toDrizzle(view), false)).toEqual(projectView(curToDrizzle(curView), false));
    expect(dz.getViewConfig(toDrizzle(view))).toMatchObject({with: {securityBarrier: true, checkOption: 'cascaded'}});
  });
  it('only pg, mysql: enum columns, tuple and object forms, materialize as the shipped ones do', () => {
    const mood = pgEnum('mood', ['sad', 'happy']);
    const level = pgEnum('level', {Low: 'low', High: 'high'} as const);
    const curMood = cur.pgEnum('mood', ['sad', 'happy']);
    const curLevel = cur.pgEnum('level', {Low: 'low', High: 'high'} as const);
    const table = pgTable('with_enum', {
      mood: mood('mood_col', {notNull: true}),
      level: level({default: ['low']}),
      bare: mood(),
    });
    const curTable = cur.pgTable('with_enum', {
      mood: curMood('mood_col').notNull(),
      level: curLevel().default('low'),
      bare: curMood(),
    });
    expect(project(toDrizzle(table))).toEqual(project(curToDrizzle(curTable)));
  });
  it('only pg, mysql: tableFromType refuses an enum column, whose runtime needs the enum values', () => {
    type WithEnum = PgTable<'with_enum', {mood: PgEnumCol<['sad', 'happy'], {notNull: true}>}>;
    type WithEnumObject = PgTable<'with_enum', {mood: PgEnumObjectCol<{Sad: 'sad'}>}>;
    expect(() => tableFromType<WithEnum>()).toThrow(/enum column, which needs its runtime handle/);
    expect(() => tableFromType<WithEnumObject>()).toThrow(/enum column, which needs its runtime handle/);
  });
  it('only pg: a materialized view materializes as the shipped one does', () => {
    const view = pgMaterializedView('totals', {total: integer({notNull: true})})
      .with({fillfactor: 90})
      .using('heap')
      .tablespace('fast_space')
      .withNoData()
      .as(sql`select count(*) as total from users`);
    const curView = cur
      .pgMaterializedView('totals', {total: cur.integer().notNull()})
      .with({fillfactor: 90})
      .using('heap')
      .tablespace('fast_space')
      .withNoData()
      .as(sql`select count(*) as total from users`);
    expect(projectView(toDrizzle(view), true)).toEqual(projectView(curToDrizzle(curView), true));
    expect(projectView(toDrizzle(view), true)).toMatchObject({using: 'heap', tablespace: 'fast_space', withNoData: true});
  });
  it('only pg: the enum handle materializes to a real drizzle enum', () => {
    const mood = pgEnum('mood', ['sad', 'happy']);
    const level = pgEnum('level', {Low: 'low', High: 'high'} as const);
    const dzMood = toDrizzle(mood);
    const dzLevel = toDrizzle(level);
    expect(dz.isPgEnum(dzMood)).toBe(true);
    expect([dzMood.enumName, dzMood.enumValues]).toEqual(['mood', ['sad', 'happy']]);
    expect(toDrizzle(mood)).toBe(dzMood);
    expect([dzLevel.enumName, dzLevel.enumValues]).toEqual(['level', ['low', 'high']]);
    expect(level.enumValues).toEqual(['low', 'high']);
  });
});

describe('next pg columns: one column shape is one runtype entry', () => {
  // Why columns carry no db name: a shape reused across tables reflects to ONE node.
  const columnId = (table: ReflectedNode, key: string) =>
    table.children!.find((member) => member.name === 'columns')!.child!.children!.find((member) => member.name === key)!.child!
      .id;
  it('the same column in two tables reflects to one id', () => {
    type Orders = PgTable<'orders', {total: Integer<{notNull: true}>}, [], {total: 'order_total'}>;
    type Items = PgTable<'items', {qty: Integer<{notNull: true}>}>;
    expect(columnId(getRunType<Orders>() as ReflectedNode, 'total')).toBe(columnId(getRunType<Items>() as ReflectedNode, 'qty'));
  });
  it('the shipped type road reflects one id per column name', () => {
    type Orders = cur.PgTable<'orders', {total: cur.Integer<'order_total', {notNull: true}>}>;
    type Items = cur.PgTable<'items', {qty: cur.Integer<'qty', {notNull: true}>}>;
    expect(columnId(getRunType<Orders>() as ReflectedNode, 'total')).not.toBe(
      columnId(getRunType<Items>() as ReflectedNode, 'qty')
    );
  });
});

describe('next pg columns: builder tables reflect on their own', () => {
  // Chain methods are an endless walk for the runtype id (MKR009): nothing reflected may reach them, alias args included.
  // Each probe is reflected first, with no hand-written twin before it.
  const solo = pgTable('solo', {
    id: uuid('id', {primaryKey: true, defaultRandom: true}),
    name: varchar('user_name', {length: 20, notNull: true}),
    seq: integer({generatedByDefaultAsIdentity: true}),
  });
  const soloView = pgView('solo_view', {name: varchar('user_name', {length: 20, notNull: true})})
    .with({securityBarrier: true})
    .existing();
  const soloCreated = pgTableCreator((name) => `x_${name}`)('solo_created', {id: integer('id', {primaryKey: true})});
  const soloSchemaTable = pgSchema('solo_schema').table('solo_items', {label: varchar('item_label', {length: 20})});
  const soloMaterialized = pgMaterializedView('solo_mview', {total: integer('total_count', {notNull: true})})
    .withNoData()
    .existing();
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
  it('only pg, mysql: a schema table', () => {
    expect(getRunTypeId<typeof soloSchemaTable>()).toBeTruthy();
    expect(getRunTypeId(soloSchemaTable)).toBe(getRunTypeId<typeof soloSchemaTable>());
  });
  it('only pg: a materialized view', () => {
    expect(getRunTypeId<typeof soloMaterialized>()).toBeTruthy();
    expect(getRunTypeId(soloMaterialized)).toBe(getRunTypeId<typeof soloMaterialized>());
  });
});

describe('next pg columns: only pg: row level security', () => {
  it('enableRLS on a builder table reaches drizzle', () => {
    const secured = pgTable('secured', {id: serial({primaryKey: true})}).enableRLS();
    const rawSecured = dz.pgTable('secured', {id: dz.serial().primaryKey()}).enableRLS();
    expect(dz.getTableConfig(toDrizzle(secured)).enableRLS).toBe(true);
    expect(project(toDrizzle(secured))).toEqual(project(rawSecured));
    expect(dz.getTableConfig(toDrizzle(pgTable('open', {id: serial()}))).enableRLS).toBe(false);
  });
});
