/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// mysql columns at run time: builder tables and hand-written table types against raw drizzle.

import {describe, it, expect} from 'vitest';
import {sql as dzSql} from 'drizzle-orm';
import * as dz from 'drizzle-orm/mysql-core';
import {createValidateFn, getRunType, getRunTypeId} from '@mionjs/run-types';
import type {UUID} from '@mionjs/run-types/formats';
import type {InferInsertModel, InferSelectModel, ReflectedNode, RtTableMeta, Sql} from '@mionjs/drizzle-orm';
import {$type, refineTableType, rtTableBrand, sql, tableRef, type TableRef} from '@mionjs/drizzle-orm';
import type {
  AnyMysqlTable,
  Bigint,
  CheckEntry,
  CustomCol,
  Decimal,
  ForeignKeyEntry,
  IndexEntry,
  Int,
  Json,
  MysqlEnumCol,
  MysqlEnumObjectCol,
  MysqlTable,
  Serial,
  Text,
  Timestamp,
  Tinyint,
  UniqueEntry,
  UniqueIndexEntry,
  Varchar,
  Year,
} from '../src/index.ts';
import {
  bigint,
  binary,
  boolean,
  char,
  check,
  customType,
  date,
  datetime,
  decimal,
  double,
  float,
  foreignKey,
  index,
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
  primaryKey,
  real,
  serial,
  smallint,
  tableFromType,
  text,
  time,
  timestamp,
  tinyint,
  tinytext,
  unique,
  uniqueIndex,
  varbinary,
  varchar,
  year,
} from '../src/index.ts';
import {drizzle as proxyDb} from 'drizzle-orm/mysql-proxy';
import {toDrizzle} from '../src/drizzle.ts';
import {project, projectView} from './tableSpecShared.ts';

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
});
type Wide = MysqlTable<
  'wide',
  {
    id: Serial<{primaryKey: true}>;
    role: Text<{enum: ['free', 'pro']; notNull: true}>;
    seq: Int<{unsigned: true; autoincrement: true}>;
    big: Bigint<{mode: 'bigint'; unsigned: true}>;
    price: Decimal<{precision: 10; scale: 2; unsigned: true}>;
    level: Tinyint<{unsigned: true; default: [1]}>;
    born: Year;
    meta: Json<{$type: [{tags: string[]}]; notNull: true}>;
    score: Int<{unique: ['uq_score']}>;
  }
>;
const rawWide = dz.mysqlTable('wide', {
  id: dz.serial('id').primaryKey(),
  role: dz.text('role', {enum: ['free', 'pro']}).notNull(),
  seq: dz.int('seq', {unsigned: true}).autoincrement(),
  big: dz.bigint('big', {mode: 'bigint', unsigned: true}),
  price: dz.decimal('price', {precision: 10, scale: 2, unsigned: true}),
  level: dz.tinyint('level', {unsigned: true}).default(1),
  born: dz.year('born'),
  meta: dz.json('meta').$type<{tags: string[]}>().notNull(),
  score: dz.int('score').unique('uq_score'),
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
const rawTeams = dz.mysqlTable('teams', {id: dz.serial().primaryKey()});
const rawMembers = dz.mysqlTable('members', {
  id: dz.serial().primaryKey(),
  teamId: dz.int('team_id').references(() => rawTeams.id, {onDelete: 'cascade'}),
});
type MembersByRef = MysqlTable<
  'members',
  {id: Serial<{primaryKey: true}>; teamId: Int<{references: [TableRef<Teams, 'id'>, {onDelete: 'cascade'}]}>},
  [],
  {teamId: 'team_id'}
>;
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
const rawPoint = dz.customType<{data: string}>({dataType: () => 'point'});
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
const rawEvery = dz.mysqlTable('every', {
  bigint: dz.bigint({mode: 'number', unsigned: true}),
  binary: dz.binary({length: 4}).notNull(),
  boolean: dz.boolean().default(true),
  char: dz.char({length: 3, enum: ['abc', 'def']}),
  date: dz.date({mode: 'string'}),
  datetime: dz.datetime({mode: 'date', fsp: 3}),
  decimal: dz.decimal({precision: 10, scale: 2}),
  double: dz.double({precision: 8, scale: 3, unsigned: true}),
  float: dz.float().autoincrement(),
  int: dz.int({unsigned: true}),
  json: dz.json(),
  longtext: dz.longtext({enum: ['a', 'b']}),
  mediumint: dz.mediumint({unsigned: true}),
  mediumtext: dz.mediumtext(),
  real: dz.real({precision: 6, scale: 2}),
  serial: dz.serial(),
  smallint: dz.smallint({unsigned: true}),
  text: dz.text().unique(),
  time: dz.time({fsp: 2}),
  timestamp: dz.timestamp({mode: 'string', fsp: 6}).defaultNow().onUpdateNow(),
  tinyint: dz.tinyint(),
  tinytext: dz.tinytext(),
  varbinary: dz.varbinary({length: 16}),
  varchar: dz.varchar({length: 10}),
  year: dz.year(),
  mood: dz.mysqlEnum(['a', 'b']),
  point: rawPoint().notNull(),
});

describe('mysql columns: same drizzle table on every road', () => {
  it('builders and raw drizzle materialize the same table', () => {
    expect(project(toDrizzle(users))).toEqual(project(rawUsers));
    expect(project(toDrizzle(wide))).toEqual(project(rawWide));
  });
  it('every builder materializes as raw drizzle does', () => {
    expect(project(toDrizzle(every))).toEqual(project(rawEvery));
    expect(dz.getTableConfig(toDrizzle(every)).columns).toHaveLength(27);
  });
  it('the dialect modifiers reach drizzle', () => {
    const modded = mysqlTable('modded', {
      seq: int({unsigned: true, autoincrement: true}),
      big: bigint({mode: 'number', unsigned: true}),
      stamp: timestamp({defaultNow: true, onUpdateNow: true}),
      touched: timestamp({onUpdateNow: true}),
    });
    const byName = (name: string) => dz.getTableConfig(toDrizzle(modded)).columns.find((column) => column.name === name)!;
    expect(byName('seq')).toMatchObject({autoIncrement: true});
    expect(byName('seq').getSQLType()).toBe('int unsigned');
    expect(byName('big').getSQLType()).toBe('bigint unsigned');
    expect(byName('stamp')).toMatchObject({hasDefault: true, hasOnUpdateNow: true});
    expect(byName('touched')).toMatchObject({hasOnUpdateNow: true});
  });
  it('a generated column keeps its config', () => {
    const generated = mysqlTable('generated', {total: int({generatedAlwaysAs: [sql`1 + 1`, {mode: 'stored'}]})});
    const rawGenerated = dz.mysqlTable('generated', {total: dz.int().generatedAlwaysAs(dzSql`1 + 1`, {mode: 'stored'})});
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
    type Slugs = MysqlTable<'slugs', {slug: Varchar<{length: 8; primaryKey: true; $defaultFn: true}>}>;
    const rawSlugs = dz.mysqlTable('slugs', {
      slug: dz
        .varchar({length: 8})
        .primaryKey()
        .$defaultFn(() => 'x'),
    });
    expect(project(toDrizzle<Slugs>({runtime: {slug: {$defaultFn: () => 'x'}}}))).toEqual(project(rawSlugs));
    expect(() => tableFromType<Slugs>()).toThrow(/carries the \$defaultFn marker/);
  });
  it('references resolve through tableRef() on builders and through options.tables on types', () => {
    expect(project(toDrizzle(members))).toEqual(project(rawMembers));
    const teamsType = tableFromType<Teams>();
    const fromTypes = toDrizzle<Members>({tables: {teams: () => teamsType}});
    expect(project(fromTypes)).toEqual(project(rawMembers));
  });
  it('a tableFromType() nested in toDrizzle() options gets its own id', () => {
    const nested = toDrizzle<MembersByRef>({tables: {teams: () => tableFromType<Teams>()}});
    expect(project(nested)).toEqual(project(rawMembers));
  });
  it('a thunk in options.tables resolves a table declared later in the file', () => {
    // drizzle's references are lazy, so a target routinely sits further down; a bare value would be read too early.
    const fromTypes = toDrizzle<Members>({tables: {teams: () => lateTeams}});
    const lateTeams = tableFromType<Teams>();
    expect(project(fromTypes)).toEqual(project(rawMembers));
  });
  it('a self-reference materializes on both roads', () => {
    expect(project(toDrizzle(emps))).toEqual(project(rawEmps));
    const selfType: object = tableFromType<Emps>({tables: {emps: () => selfType}});
    expect(project(toDrizzle(selfType as Emps))).toEqual(project(rawEmps));
  });
  it('two tables from types with one name keep their own columns in one database', () => {
    // drizzle caches a keyless column's name per table name, so a table from a type names every column.
    const db = proxyDb(async () => ({rows: []}));
    type First = MysqlTable<'dup', {id: Int; name: Text}>;
    type Second = MysqlTable<'dup', {id: Int; firstName: Text}>;
    db.insert(toDrizzle(tableFromType<First>())).values({id: 1, name: 'a'}).toSQL();
    expect(db.insert(toDrizzle(tableFromType<Second>())).values({id: 1, firstName: 'b'}).toSQL().sql).toContain('firstName');
  });
  it('a literal sql default rebuilds from the type', () => {
    type Stamped = MysqlTable<'stamped', {at: Timestamp<{default: [Sql<'now()'>]}>}>;
    const stamped = mysqlTable('stamped', {at: timestamp({default: [sql`now()`]})});
    const rawStamped = dz.mysqlTable('stamped', {at: dz.timestamp().default(dzSql`now()`)});
    expect(project(toDrizzle(stamped))).toEqual(project(rawStamped));
    expect(project(toDrizzle(tableFromType<Stamped>()))).toEqual(project(rawStamped));
  });
  it('foreignKey takes a tableRef() for the other table', () => {
    const withFk = mysqlTable('with_fk', {teamId: int('team_id')}, (t) => [
      foreignKey({name: 'fk_team', columns: [t.teamId], foreignColumns: [tableRef(teams, 'id')]}).onDelete('cascade'),
    ]);
    const rawWithFk = dz.mysqlTable('with_fk', {teamId: dz.int('team_id')}, (t) => [
      dz.foreignKey({name: 'fk_team', columns: [t.teamId], foreignColumns: [rawTeams.id]}).onDelete('cascade'),
    ]);
    expect(project(toDrizzle(withFk))).toEqual(project(rawWithFk));
  });
  // pg's index clones an extraConfig column, so there a standalone index takes an expression (the standalone test).
  it('only mysql, sqlite: an index declared outside its table takes a tableRef() column', () => {
    const built = toDrizzle(index('teams_id_idx').on(tableRef(teams, 'id')));
    expect((built as unknown as {config: {columns: unknown[]}}).config.columns).toEqual([toDrizzle(teams).id]);
  });
  it('the index and constraint helpers work in extraConfig', () => {
    const indexed = mysqlTable('indexed', {a: int('a', {notNull: true}), b: varchar('b', {length: 20})}, (t) => [
      index('idx_b').on(t.b).using('btree').algorithm('inplace').lock('none'),
      uniqueIndex('uidx_a').on(t.a),
      unique('uq_ab').on(t.a, t.b),
      check('chk_a', sql`a > 0`),
      primaryKey({columns: [t.a, t.b]}),
    ]);
    const rawIndexed = dz.mysqlTable('indexed', {a: dz.int('a').notNull(), b: dz.varchar('b', {length: 20})}, (t) => [
      dz.index('idx_b').on(t.b).using('btree').algorithm('inplace').lock('none'),
      dz.uniqueIndex('uidx_a').on(t.a),
      dz.unique('uq_ab').on(t.a, t.b),
      dz.check('chk_a', dzSql`a > 0`),
      dz.primaryKey({columns: [t.a, t.b]}),
    ]);
    expect(project(toDrizzle(indexed))).toEqual(project(rawIndexed));
    expect(project(toDrizzle(indexed)).indexes).toContainEqual(
      expect.objectContaining({name: 'idx_b', using: 'btree', algorithm: 'inplace', lock: 'none'})
    );
  });
  it('an index takes its options after its columns, as drizzle does', () => {
    mysqlTable('ordered', {a: int('a')}, (t) => [
      // @ts-expect-error an index option before on() does not exist on drizzle's index builder
      index('idx_a').using('btree'),
      index('idx_a2').on(t.a).using('btree'),
    ]);
    expect(true).toBe(true);
  });
  it('a standalone index materializes on its own', () => {
    // drizzle's index clones an extraConfig column, so outside one it takes an expression, as raw drizzle does.
    const standalone = index('solo_name').on(sql`lower(name)`);
    const built = toDrizzle(standalone);
    expect(built).toBeInstanceOf(dz.IndexBuilder);
    expect((built as unknown as {config: object}).config).toMatchObject({name: 'solo_name', columns: [expect.anything()]});
  });
  it('toDrizzle rejects a value that is neither table, handle nor options', () => {
    expect(() => toDrizzle({bogus: true} as never)).toThrowError(/takes a slim table/);
  });
  it('a reference written without tableRef() fails with an actionable error', () => {
    const loose = mysqlTable('loose', {teamId: int({references: [() => ({table: 'teams', column: 'id'})]})});
    expect(() => dz.getTableConfig(toDrizzle(loose)).foreignKeys[0]?.reference()).toThrowError(/tableRef\(table, column\)/);
  });
  it('a reference to a missing column fails with an actionable error', () => {
    type Typo = MysqlTable<'typo', {pid: Int<{references: [{table: 'teams'; column: 'idd'}]}>}>;
    const teamsType = tableFromType<Teams>();
    const typo = toDrizzle(tableFromType<Typo>({tables: {teams: teamsType}}));
    expect(() => dz.getTableConfig(typo).foreignKeys[0]?.reference()).toThrowError(/references no column "idd" in table "teams"/);
  });
  it('a type reference with no table passed fails with an actionable error', () => {
    expect(() => tableFromType<Members>({})).toThrow(/pass it via tableFromType options: \{tables: \{teams: \.\.\.\}\}/);
  });
});

// Table-level extras on the type road: the extras tuple.
const extras = mysqlTable('extras_t', {a: int({notNull: true}), b: varchar({length: 10}), pid: int()}, (t) => [
  index('idx_a').on(t.a),
  uniqueIndex('uidx_b').on(t.b),
  unique('uq_ab').on(t.a, t.b),
  check('chk_a', sql`a >= 0`),
  foreignKey({name: 'fk_pid', columns: [t.pid], foreignColumns: [tableRef(teams, 'id')]}),
]);
type Extras = MysqlTable<
  'extras_t',
  {a: Int<{notNull: true}>; b: Varchar<{length: 10}>; pid: Int},
  [
    IndexEntry<'idx_a', ['a']>,
    UniqueIndexEntry<'uidx_b', ['b']>,
    UniqueEntry<'uq_ab', ['a', 'b']>,
    CheckEntry<'chk_a', Sql<'a >= 0'>>,
    ForeignKeyEntry<'fk_pid', ['pid'], 'teams', ['id']>,
  ]
>;

describe('mysql columns: table-level extras on the type road', () => {
  it('the extras tuple materializes the same indexes, checks and foreign keys as the builders', () => {
    const fromType = tableFromType<Extras>({tables: {teams: tableFromType<Teams>()}});
    expect(project(toDrizzle(fromType))).toEqual(project(toDrizzle(extras)));
  });
  it('static form: the models ignore the extras tuple', () => {
    expect(getRunTypeId<InferSelectModel<Extras>>()).toBeTruthy();
    expect(getRunTypeId<InferSelectModel<Extras>>()).toBe(getRunTypeId<InferSelectModel<typeof extras>>());
  });
  it('reflection form: the models ignore the extras tuple', () => {
    const row = {} as InferSelectModel<Extras>;
    expect(getRunTypeId(row)).toBeTruthy();
    expect(getRunTypeId(row)).toBe(getRunTypeId<InferSelectModel<typeof extras>>());
  });
});

// Runtime callbacks: the type records the marker, the callbacks ride options.runtime.
const runtimeBuilt = mysqlTable('runtime_t', {
  id: serial({primaryKey: true}),
  slug: varchar({length: 80, notNull: true, $defaultFn: [() => 'slug-1']}),
  counter: int({$default: [() => 7]}),
  updatedAt: timestamp('updated_at', {mode: 'string', $onUpdate: [() => 'updated-now']}),
  touched: int({$onUpdateFn: [() => 1]}),
});
type RuntimeTable = MysqlTable<
  'runtime_t',
  {
    id: Serial<{primaryKey: true}>;
    slug: Varchar<{length: 80; notNull: true; $defaultFn: true}>;
    counter: Int<{$default: true}>;
    updatedAt: Timestamp<{mode: 'string'; $onUpdate: true}>;
    touched: Int<{$onUpdateFn: true}>;
  },
  [],
  {updatedAt: 'updated_at'}
>;
const runtimeCallbacks = {
  slug: {$defaultFn: () => 'slug-1'},
  counter: {$default: () => 7},
  updatedAt: {$onUpdate: () => 'updated-now'},
  touched: {$onUpdateFn: () => 1},
};
/** Each column's runtime hooks, called, so the oracle compares callback BEHAVIOR, not function identity. */
function runtimeHooks(table: unknown) {
  return Object.fromEntries(
    dz.getTableConfig(table as never).columns.map((column) => {
      const hooks = column as unknown as {defaultFn?: () => unknown; onUpdateFn?: () => unknown};
      return [column.name, {defaultFn: hooks.defaultFn?.(), onUpdateFn: hooks.onUpdateFn?.()}];
    })
  );
}

describe('mysql columns: runtime callbacks', () => {
  it('the type road materializes the builder table, callbacks included', () => {
    const bridged = toDrizzle(tableFromType<RuntimeTable>({runtime: runtimeCallbacks}));
    expect(project(bridged)).toEqual(project(toDrizzle(runtimeBuilt)));
    expect(runtimeHooks(bridged)).toEqual(runtimeHooks(toDrizzle(runtimeBuilt)));
    expect(runtimeHooks(bridged).slug).toEqual({defaultFn: 'slug-1', onUpdateFn: undefined});
    expect(runtimeHooks(bridged).updated_at).toEqual({defaultFn: undefined, onUpdateFn: 'updated-now'});
  });
  it('two calls with options are independent: each keeps its own callback', () => {
    const first = tableFromType<RuntimeTable>({runtime: {...runtimeCallbacks, slug: {$defaultFn: () => 'first'}}});
    const second = tableFromType<RuntimeTable>({runtime: {...runtimeCallbacks, slug: {$defaultFn: () => 'second'}}});
    expect(first).not.toBe(second);
    expect(runtimeHooks(toDrizzle(first)).slug!.defaultFn).toBe('first');
    expect(runtimeHooks(toDrizzle(second)).slug!.defaultFn).toBe('second');
  });
  it('an options.runtime callback without its marker fails', () => {
    type NoMarker = MysqlTable<'no_marker_runtime', {n: Int}>;
    expect(() => tableFromType<NoMarker>({runtime: {n: {$onUpdate: () => 1}}})).toThrowError(
      /options\.runtime\.n\.\$onUpdate has no matching/
    );
  });
});

// A table carries the dialect that recorded it, so another dialect's table is a compile error, not a runtime crash.
// The foreign table is spelled here rather than imported: a dialect package must not depend on its siblings.
describe('mysql columns: tables are typed to their dialect', () => {
  it('tags what the table builder and the table type produce with the dialect', () => {
    const table = mysqlTable('tagged', {id: int({primaryKey: true})});
    const accepted: AnyMysqlTable = table;
    const acceptedType: AnyMysqlTable = {} as MysqlTable<'tagged', {id: Int<{primaryKey: true}>}>;
    expect(accepted).toBe(table);
    expect(acceptedType).toBeDefined();
  });
  it('rejects another dialect table, as a value and as a type argument', () => {
    interface OtherDialect extends RtTableMeta<'users', {id: Int}, []> {
      readonly [rtTableBrand]?: 'other';
    }
    // @ts-expect-error another dialect's table is not a mysql table
    const rejected: AnyMysqlTable = {} as OtherDialect;
    // @ts-expect-error and it cannot be rebuilt through this dialect's tableFromType either
    void tableFromType<OtherDialect>;
    expect(rejected).toBeDefined();
  });
});

describe('mysql columns: table creators and the columns callback', () => {
  it('the table creator maps the table name like raw drizzle', () => {
    const create = mysqlTableCreator((name) => `app_${name}`);
    const rawCreate = dz.mysqlTableCreator((name) => `app_${name}`);
    const table = create('notes', {id: serial({primaryKey: true}), body: text('body_text', {notNull: true})});
    const rawTable = rawCreate('notes', {id: dz.serial().primaryKey(), body: dz.text('body_text').notNull()});
    expect(project(toDrizzle(table)).name).toBe('app_notes');
    expect(project(toDrizzle(table))).toEqual(project(rawTable));
  });
  it('the table builder and the table creator hand a columns callback the builders', () => {
    const create = mysqlTableCreator((name) => `app_${name}`);
    const byCallback = create('notes', (helpers) => ({
      id: helpers.serial({primaryKey: true}),
      body: helpers.text({notNull: true}),
    }));
    const plain = mysqlTable('notes', (helpers) => ({
      id: helpers.serial({primaryKey: true}),
      body: helpers.text({notNull: true}),
    }));
    const rawColumns = () => ({id: dz.serial().primaryKey(), body: dz.text().notNull()});
    expect(project(toDrizzle(plain))).toEqual(project(dz.mysqlTable('notes', rawColumns())));
    expect(project(toDrizzle(byCallback))).toEqual(project(dz.mysqlTableCreator((name) => `app_${name}`)('notes', rawColumns())));
  });
});

describe('mysql columns: only pg, mysql: schemas', () => {
  it('schema tables and views materialize schema-qualified, and toDrizzle(schema) too', () => {
    const shop = mysqlSchema('shop');
    const rawShop = dz.mysqlSchema('shop');
    const items = shop.table('items', {id: serial({primaryKey: true}), label: varchar('item_label', {length: 20})});
    const rawItems = rawShop.table('items', {id: dz.serial().primaryKey(), label: dz.varchar('item_label', {length: 20})});
    expect(project(toDrizzle(items))).toEqual(project(rawItems));
    expect(dz.getTableConfig(toDrizzle(items)).schema).toBe('shop');
    const view = shop.view('item_view', {label: varchar({length: 20})}).as(sql`select label from items`);
    const rawView = rawShop.view('item_view', {label: dz.varchar({length: 20})}).as(dzSql`select label from items`);
    expect(projectView(toDrizzle(view))).toEqual(projectView(rawView));
    expect(dz.getViewConfig(toDrizzle(view)).schema).toBe('shop');
    expect(toDrizzle(shop)).toBeInstanceOf(dz.MySqlSchema);
  });
  it('a schema table takes the columns callback too', () => {
    const shop = mysqlSchema('shop');
    const byCallback = shop.table('things', (helpers) => ({
      id: helpers.int({primaryKey: true}),
      note: helpers.text({notNull: true}),
      mood: helpers.mysqlEnum(['a', 'b']),
    }));
    const rawThings = dz
      .mysqlSchema('shop')
      .table('things', {id: dz.int().primaryKey(), note: dz.text().notNull(), mood: dz.mysqlEnum(['a', 'b'])});
    expect(project(toDrizzle(byCallback))).toEqual(project(rawThings));
  });
});

describe('mysql columns: one runtype id for builder and hand-written tables', () => {
  // Marker test coverage rule: both getRunTypeId call shapes, paired.
  it('static form: the table and its models share one id', () => {
    expect(getRunTypeId<Users>()).toBeTruthy();
    expect(getRunTypeId<Users>()).toBe(getRunTypeId<typeof users>());
    expect(getRunTypeId<InferSelectModel<Users>>()).toBeTruthy();
    expect(getRunTypeId<InferSelectModel<Users>>()).toBe(getRunTypeId<InferSelectModel<typeof users>>());
    expect(getRunTypeId<InferInsertModel<Wide>>()).toBeTruthy();
    expect(getRunTypeId<InferInsertModel<Wide>>()).toBe(getRunTypeId<InferInsertModel<typeof wide>>());
  });
  it('reflection form: the table and its models share one id', () => {
    expect(getRunTypeId(users)).toBeTruthy();
    expect(getRunTypeId(users)).toBe(getRunTypeId<Users>());
    const row = {} as InferSelectModel<typeof users>;
    expect(getRunTypeId(row)).toBeTruthy();
    expect(getRunTypeId(row)).toBe(getRunTypeId<InferSelectModel<Users>>());
    const insert = {} as InferInsertModel<Wide>;
    expect(getRunTypeId(insert)).toBeTruthy();
    expect(getRunTypeId(insert)).toBe(getRunTypeId<InferInsertModel<typeof wide>>());
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

describe('mysql columns: views, enums and custom types', () => {
  it('a view materializes the same drizzle view as raw drizzle', () => {
    const view = mysqlView('active', {name: varchar('user_name', {length: 10, notNull: true})}).as(
      sql`select user_name from users`
    );
    const rawView = dz
      .mysqlView('active', {name: dz.varchar('user_name', {length: 10}).notNull()})
      .as(dzSql`select user_name from users`);
    expect(projectView(toDrizzle(view))).toEqual(projectView(rawView));
  });
  it('an existing view materializes as raw drizzle does', () => {
    const view = mysqlView('existing_view', {id: int({notNull: true})}).existing();
    const rawView = dz.mysqlView('existing_view', {id: dz.int().notNull()}).existing();
    expect(projectView(toDrizzle(view))).toEqual(projectView(rawView));
  });
  it('a view without columns fails naming the unsupported form', () => {
    expect(() => (mysqlView as (name: string) => unknown)('from_query')).toThrow(/without columns/);
  });
  it('a customType column materializes as raw drizzle does', () => {
    const params = {dataType: () => 'point', toDriver: (value: {x: number}) => JSON.stringify(value)};
    const custom = customType<{data: {x: number}}>(params);
    const rawCustom = dz.customType<{data: {x: number}}>(params);
    const table = mysqlTable('with_custom', {at: custom('at_point', {notNull: true})});
    const rawTable = dz.mysqlTable('with_custom', {at: rawCustom('at_point').notNull()});
    expect(project(toDrizzle(table))).toEqual(project(rawTable));
  });
  it('tableFromType refuses a custom column, whose runtime needs the customType callbacks', () => {
    type WithCustom = MysqlTable<'with_custom', {at: CustomCol<{x: number}, {notNull: true}>}>;
    expect(() => tableFromType<WithCustom>()).toThrow(/custom column, which needs its runtime handle/);
  });
  it('only pg, mysql: view options materialize as raw drizzle does', () => {
    const view = mysqlView('secure', {name: varchar('user_name', {length: 10})})
      .algorithm('merge')
      .sqlSecurity('invoker')
      .withCheckOption('cascaded')
      .as(sql`select user_name from users`);
    const rawView = dz
      .mysqlView('secure', {name: dz.varchar('user_name', {length: 10})})
      .algorithm('merge')
      .sqlSecurity('invoker')
      .withCheckOption('cascaded')
      .as(dzSql`select user_name from users`);
    expect(projectView(toDrizzle(view))).toEqual(projectView(rawView));
    expect(dz.getViewConfig(toDrizzle(view))).toMatchObject({
      algorithm: 'merge',
      sqlSecurity: 'invoker',
      withCheckOption: 'cascaded',
    });
  });
  it('only pg, mysql: enum columns, tuple and object forms, materialize as raw drizzle does', () => {
    const table = mysqlTable('with_enum', {
      mood: mysqlEnum('mood_col', ['sad', 'happy'], {notNull: true}),
      level: mysqlEnum({Low: 'low', High: 'high'} as const, {default: ['low']}),
      bare: mysqlEnum(['sad', 'happy']),
    });
    const rawTable = dz.mysqlTable('with_enum', {
      mood: dz.mysqlEnum('mood_col', ['sad', 'happy']).notNull(),
      level: dz.mysqlEnum({Low: 'low', High: 'high'} as const).default('low'),
      bare: dz.mysqlEnum(['sad', 'happy']),
    });
    expect(project(toDrizzle(table))).toEqual(project(rawTable));
  });
  it('only pg, mysql: tableFromType refuses an enum column, whose runtime needs the enum values', () => {
    type WithEnum = MysqlTable<'with_enum', {mood: MysqlEnumCol<['sad', 'happy'], {notNull: true}>}>;
    type WithEnumObject = MysqlTable<'with_enum', {mood: MysqlEnumObjectCol<{Sad: 'sad'}>}>;
    expect(() => tableFromType<WithEnum>()).toThrow(/enum column, which needs its runtime handle/);
    expect(() => tableFromType<WithEnumObject>()).toThrow(/enum column, which needs its runtime handle/);
  });
});

describe('mysql columns: one column shape is one runtype entry', () => {
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

describe('mysql columns: builder tables reflect on their own', () => {
  // A column type carries no methods: the runtype id walks method return types (MKR009), alias args included.
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
  const soloCreated = mysqlTableCreator((name) => `x_${name}`)('solo_created', {id: int('id', {primaryKey: true})});
  const soloSchemaTable = mysqlSchema('solo_schema').table('solo_items', {label: varchar('item_label', {length: 20})});
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
});

// drizzle's array form AND its older keyed-object one, which its own suites still write; the array may also group.
describe('mysql columns: extraConfig forms', () => {
  const columns = () => ({id: int('id', {primaryKey: true}), owner: varchar('owner', {length: 40, notNull: true})});
  const rawColumns = () => ({id: dz.int('id').primaryKey(), owner: dz.varchar('owner', {length: 40}).notNull()});
  it('the keyed-object form materializes as raw drizzle does, keeping every entry', () => {
    const keyed = mysqlTable('object_config', columns(), (t) => ({
      ownerIdx: index('object_config_owner_idx').on(t.owner),
      ownerUnique: unique('object_config_owner_unique').on(t.owner),
    }));
    const rawKeyed = dz.mysqlTable('object_config', rawColumns(), (t) => ({
      ownerIdx: dz.index('object_config_owner_idx').on(t.owner),
      ownerUnique: dz.unique('object_config_owner_unique').on(t.owner),
    }));
    expect(project(toDrizzle(keyed))).toEqual(project(rawKeyed));
    const config = dz.getTableConfig(toDrizzle(keyed));
    expect(config.indexes.map((entry) => entry.config.name)).toEqual(['object_config_owner_idx']);
    expect(config.uniqueConstraints.map((entry) => entry.name)).toEqual(['object_config_owner_unique']);
  });
  it('a grouped array flattens one level, as drizzle does', () => {
    const grouped = mysqlTable('grouped_config', columns(), (t) => [
      [index('grouped_config_owner_idx').on(t.owner), unique('grouped_config_owner_unique').on(t.owner)],
    ]);
    const rawGrouped = dz.mysqlTable(
      'grouped_config',
      rawColumns(),
      (t) => [[dz.index('grouped_config_owner_idx').on(t.owner), dz.unique('grouped_config_owner_unique').on(t.owner)]] as never
    );
    expect(project(toDrizzle(grouped))).toEqual(project(rawGrouped));
    const config = dz.getTableConfig(toDrizzle(grouped));
    expect(config.indexes.map((entry) => entry.config.name)).toEqual(['grouped_config_owner_idx']);
    expect(config.uniqueConstraints.map((entry) => entry.name)).toEqual(['grouped_config_owner_unique']);
  });
});

// The models drive full-fidelity validators, captured and refined params included.
const people = mysqlTable('people', {
  id: varchar({length: 36, primaryKey: true, $type: $type<UUID>()}),
  name: varchar({length: 100, notNull: true}),
  age: int({notNull: true}),
  role: text({enum: ['admin', 'user'], notNull: true}),
  bio: text(),
  createdAt: timestamp('created_at', {defaultNow: true, notNull: true}),
});
const apiPeople = refineTableType(people, {name: {minLength: 3}, age: {min: 18}});
type Person = InferSelectModel<typeof apiPeople>;
const validPerson = {
  id: '793aff46-42ac-4372-b7fa-c48ba48ed94f',
  name: 'ann-lee',
  age: 30,
  role: 'admin',
  bio: null,
  createdAt: new Date(),
};

describe('mysql columns: models compile full-fidelity validators', () => {
  const validatePerson = createValidateFn<Person>();
  const validateInsert = createValidateFn<InferInsertModel<typeof apiPeople>>();
  const validatePatch = createValidateFn<Partial<InferInsertModel<typeof apiPeople>>>();
  it('the refined table is the same object; only typeof carries the refinement', () => {
    expect(apiPeople).toBe(people);
    expect(toDrizzle(apiPeople)).toBe(toDrizzle(people));
  });
  it('accepts a valid row (nullable column as null)', () => {
    expect(validatePerson(validPerson)).toBe(true);
  });
  it('enforces captured and refined params (uuid, maxLength, minLength, min, enum, integer range)', () => {
    expect(validatePerson({...validPerson, id: 'not-a-uuid'})).toBe(false);
    expect(validatePerson({...validPerson, name: 'x'.repeat(101)})).toBe(false);
    expect(validatePerson({...validPerson, name: 'ab'})).toBe(false);
    expect(validatePerson({...validPerson, age: 17})).toBe(false);
    expect(validatePerson({...validPerson, age: 3000000000})).toBe(false);
    expect(validatePerson({...validPerson, age: 20.5})).toBe(false);
    expect(validatePerson({...validPerson, role: 'root'})).toBe(false);
  });
  it('insert rejects a missing required column; patch is a real partial', () => {
    expect(validateInsert({id: validPerson.id, name: 'ann-lee', age: 21, role: 'user'})).toBe(true);
    expect(validateInsert({name: 'ann-lee', age: 21, role: 'user'})).toBe(false);
    expect(validatePatch({})).toBe(true);
    expect(validatePatch({age: 17})).toBe(false);
  });
  it('static form: the refined model resolves', () => {
    expect(getRunTypeId<Person>()).toBeTruthy();
  });
  it('reflection form: the refined model resolves to the same id', () => {
    const person: Person = validPerson as Person;
    expect(getRunTypeId(person)).toBe(getRunTypeId<Person>());
  });
});
