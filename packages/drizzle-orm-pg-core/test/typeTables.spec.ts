/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// pg columns at run time: builder tables and hand-written table types against raw drizzle.

import {describe, it, expect} from 'vitest';
import {sql as dzSql} from 'drizzle-orm';
import * as dz from 'drizzle-orm/pg-core';
import {createValidateFn, getRunType, getRunTypeId} from '@mionjs/run-types';
import type {InferInsertModel, InferSelectModel, ReflectedNode, RtTableMeta, Sql} from '@mionjs/drizzle-orm';
import {$type, refineTableType, rtTableBrand, sql, tableRef, type TableRef} from '@mionjs/drizzle-orm';
import type {
  AnyPgTable,
  CheckEntry,
  CustomCol,
  ForeignKeyEntry,
  IndexEntry,
  Integer,
  Jsonb,
  PgEnumCol,
  PgEnumObjectCol,
  PgTable,
  Serial,
  Text,
  Timestamp,
  UniqueEntry,
  UniqueIndexEntry,
  Uuid,
  Varchar,
} from '../src/index.ts';
import {
  bigint,
  bigserial,
  bit,
  boolean,
  char,
  check,
  cidr,
  customType,
  date,
  decimal,
  doublePrecision,
  foreignKey,
  geometry,
  halfvec,
  index,
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
  primaryKey,
  real,
  serial,
  smallint,
  smallserial,
  sparsevec,
  tableFromType,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  vector,
} from '../src/index.ts';
import {drizzle as proxyDb} from 'drizzle-orm/pg-proxy';
import {toDrizzle} from '../src/drizzle.ts';
import {project, projectView} from './tableSpecShared.ts';

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
const rawTeams = dz.pgTable('teams', {id: dz.serial().primaryKey()});
const rawMembers = dz.pgTable('members', {
  id: dz.serial().primaryKey(),
  teamId: dz.integer('team_id').references(() => rawTeams.id, {onDelete: 'cascade'}),
});
type MembersByRef = PgTable<
  'members',
  {id: Serial<{primaryKey: true}>; teamId: Integer<{references: [TableRef<Teams, 'id'>, {onDelete: 'cascade'}]}>},
  [],
  {teamId: 'team_id'}
>;
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
const rawCitext = dz.customType<{data: string}>({dataType: () => 'citext'});
const everyMood = pgEnum('every_mood', ['a', 'b']);
const rawEveryMood = dz.pgEnum('every_mood', ['a', 'b']);
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
const rawEvery = dz.pgTable('every', {
  bigint: dz.bigint({mode: 'bigint'}),
  bigserial: dz.bigserial({mode: 'number'}),
  bit: dz.bit({dimensions: 8}),
  boolean: dz.boolean().default(true),
  char: dz.char({length: 3, enum: ['abc', 'def']}),
  cidr: dz.cidr(),
  date: dz.date({mode: 'date'}),
  decimal: dz.decimal({precision: 10, scale: 2}),
  doublePrecision: dz.doublePrecision(),
  geometry: dz.geometry({type: 'point', mode: 'xy', srid: 4326}),
  halfvec: dz.halfvec({dimensions: 3}),
  inet: dz.inet(),
  integer: dz.integer().notNull(),
  interval: dz.interval({fields: 'day', precision: 2}),
  json: dz.json(),
  jsonb: dz.jsonb(),
  line: dz.line({mode: 'abc'}),
  macaddr: dz.macaddr(),
  macaddr8: dz.macaddr8(),
  numeric: dz.numeric({mode: 'number', precision: 8}),
  point: dz.point({mode: 'xy'}),
  real: dz.real(),
  serial: dz.serial(),
  smallint: dz.smallint().generatedByDefaultAsIdentity(),
  smallserial: dz.smallserial(),
  sparsevec: dz.sparsevec({dimensions: 5}),
  text: dz.text().unique(),
  time: dz.time({precision: 3, withTimezone: true}),
  timestamp: dz.timestamp({mode: 'string', precision: 6, withTimezone: true}),
  uuid: dz.uuid().defaultRandom(),
  varchar: dz.varchar({length: 10}),
  vector: dz.vector({dimensions: 3}),
  mood: rawEveryMood(),
  citext: rawCitext().notNull(),
});

describe('pg columns: same drizzle table on every road', () => {
  it('builders and raw drizzle materialize the same table', () => {
    expect(project(toDrizzle(users))).toEqual(project(rawUsers));
    expect(project(toDrizzle(wide))).toEqual(project(rawWide));
  });
  it('every builder materializes as raw drizzle does', () => {
    expect(project(toDrizzle(every))).toEqual(project(rawEvery));
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
    const rawSlugs = dz.pgTable('slugs', {
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
    type First = PgTable<'dup', {id: Integer; name: Text}>;
    type Second = PgTable<'dup', {id: Integer; firstName: Text}>;
    db.insert(toDrizzle(tableFromType<First>())).values({id: 1, name: 'a'}).toSQL();
    expect(db.insert(toDrizzle(tableFromType<Second>())).values({id: 1, firstName: 'b'}).toSQL().sql).toContain('firstName');
  });
  it('a literal sql default rebuilds from the type', () => {
    type Stamped = PgTable<'stamped', {at: Timestamp<{default: [Sql<'now()'>]}>}>;
    const stamped = pgTable('stamped', {at: timestamp({default: [sql`now()`]})});
    const rawStamped = dz.pgTable('stamped', {at: dz.timestamp().default(dzSql`now()`)});
    expect(project(toDrizzle(stamped))).toEqual(project(rawStamped));
    expect(project(toDrizzle(tableFromType<Stamped>()))).toEqual(project(rawStamped));
  });
  it('foreignKey takes a tableRef() for the other table', () => {
    const withFk = pgTable('with_fk', {teamId: integer('team_id')}, (t) => [
      foreignKey({name: 'fk_team', columns: [t.teamId], foreignColumns: [tableRef(teams, 'id')]}).onDelete('cascade'),
    ]);
    const rawWithFk = dz.pgTable('with_fk', {teamId: dz.integer('team_id')}, (t) => [
      dz.foreignKey({name: 'fk_team', columns: [t.teamId], foreignColumns: [rawTeams.id]}).onDelete('cascade'),
    ]);
    expect(project(toDrizzle(withFk))).toEqual(project(rawWithFk));
  });
  it('the index and constraint helpers work in extraConfig', () => {
    const indexed = pgTable('indexed', {a: integer('a', {notNull: true}), b: text('b')}, (t) => [
      index('idx_b').using('btree', t.b),
      uniqueIndex('uidx_a')
        .on(t.a)
        .where(sql`a > 0`),
      unique('uq_ab').on(t.a, t.b),
      check('chk_a', sql`a > 0`),
      primaryKey({columns: [t.a, t.b]}),
    ]);
    const rawIndexed = dz.pgTable('indexed', {a: dz.integer('a').notNull(), b: dz.text('b')}, (t) => [
      dz.index('idx_b').using('btree', t.b),
      dz
        .uniqueIndex('uidx_a')
        .on(t.a)
        .where(dzSql`a > 0`),
      dz.unique('uq_ab').on(t.a, t.b),
      dz.check('chk_a', dzSql`a > 0`),
      dz.primaryKey({columns: [t.a, t.b]}),
    ]);
    expect(project(toDrizzle(indexed))).toEqual(project(rawIndexed));
  });
  it('an index takes its options after its columns, as drizzle does', () => {
    pgTable('ordered', {a: integer('a')}, (t) => [
      // @ts-expect-error an index option before on() does not exist on drizzle's index builder
      index('idx_a').where(sql`a > 0`),
      index('idx_a2')
        .on(t.a)
        .where(sql`a > 0`),
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
    const loose = pgTable('loose', {teamId: integer({references: [() => ({table: 'teams', column: 'id'})]})});
    expect(() => dz.getTableConfig(toDrizzle(loose)).foreignKeys[0]?.reference()).toThrowError(/tableRef\(table, column\)/);
  });
  it('a reference to a missing column fails with an actionable error', () => {
    type Typo = PgTable<'typo', {pid: Integer<{references: [{table: 'teams'; column: 'idd'}]}>}>;
    const teamsType = tableFromType<Teams>();
    const typo = toDrizzle(tableFromType<Typo>({tables: {teams: teamsType}}));
    expect(() => dz.getTableConfig(typo).foreignKeys[0]?.reference()).toThrowError(/references no column "idd" in table "teams"/);
  });
  it('a type reference with no table passed fails with an actionable error', () => {
    expect(() => tableFromType<Members>({})).toThrow(/pass it via tableFromType options: \{tables: \{teams: \.\.\.\}\}/);
  });
});

// Table-level extras on the type road: the extras tuple.
const extras = pgTable('extras_t', {a: integer({notNull: true}), b: varchar({length: 10}), pid: integer()}, (t) => [
  index('idx_a').on(t.a),
  uniqueIndex('uidx_b').on(t.b),
  unique('uq_ab').on(t.a, t.b),
  check('chk_a', sql`a >= 0`),
  foreignKey({name: 'fk_pid', columns: [t.pid], foreignColumns: [tableRef(teams, 'id')]}),
]);
type Extras = PgTable<
  'extras_t',
  {a: Integer<{notNull: true}>; b: Varchar<{length: 10}>; pid: Integer},
  [
    IndexEntry<'idx_a', ['a']>,
    UniqueIndexEntry<'uidx_b', ['b']>,
    UniqueEntry<'uq_ab', ['a', 'b']>,
    CheckEntry<'chk_a', Sql<'a >= 0'>>,
    ForeignKeyEntry<'fk_pid', ['pid'], 'teams', ['id']>,
  ]
>;

describe('pg columns: table-level extras on the type road', () => {
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
const runtimeBuilt = pgTable('runtime_t', {
  id: uuid({primaryKey: true}),
  slug: varchar({length: 80, notNull: true, $defaultFn: [() => 'slug-1']}),
  counter: integer({$default: [() => 7]}),
  updatedAt: timestamp('updated_at', {mode: 'string', $onUpdate: [() => 'updated-now']}),
  touched: integer({$onUpdateFn: [() => 1]}),
});
type RuntimeTable = PgTable<
  'runtime_t',
  {
    id: Uuid<{primaryKey: true}>;
    slug: Varchar<{length: 80; notNull: true; $defaultFn: true}>;
    counter: Integer<{$default: true}>;
    updatedAt: Timestamp<{mode: 'string'; $onUpdate: true}>;
    touched: Integer<{$onUpdateFn: true}>;
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

describe('pg columns: runtime callbacks', () => {
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
    type NoMarker = PgTable<'no_marker_runtime', {n: Integer}>;
    expect(() => tableFromType<NoMarker>({runtime: {n: {$onUpdate: () => 1}}})).toThrowError(
      /options\.runtime\.n\.\$onUpdate has no matching/
    );
  });
});

// A table carries the dialect that recorded it, so another dialect's table is a compile error, not a runtime crash.
// The foreign table is spelled here rather than imported: a dialect package must not depend on its siblings.
describe('pg columns: tables are typed to their dialect', () => {
  it('tags what the table builder and the table type produce with the dialect', () => {
    const table = pgTable('tagged', {id: integer({primaryKey: true})});
    const accepted: AnyPgTable = table;
    const acceptedType: AnyPgTable = {} as PgTable<'tagged', {id: Integer<{primaryKey: true}>}>;
    expect(accepted).toBe(table);
    expect(acceptedType).toBeDefined();
  });
  it('rejects another dialect table, as a value and as a type argument', () => {
    interface OtherDialect extends RtTableMeta<'users', {id: Integer}, []> {
      readonly [rtTableBrand]?: 'other';
    }
    // @ts-expect-error another dialect's table is not a pg table
    const rejected: AnyPgTable = {} as OtherDialect;
    // @ts-expect-error and it cannot be rebuilt through this dialect's tableFromType either
    void tableFromType<OtherDialect>;
    expect(rejected).toBeDefined();
  });
});

describe('pg columns: table creators and the columns callback', () => {
  it('the table creator maps the table name like raw drizzle', () => {
    const create = pgTableCreator((name) => `app_${name}`);
    const rawCreate = dz.pgTableCreator((name) => `app_${name}`);
    const table = create('notes', {id: serial({primaryKey: true}), body: text('body_text', {notNull: true})});
    const rawTable = rawCreate('notes', {id: dz.serial().primaryKey(), body: dz.text('body_text').notNull()});
    expect(project(toDrizzle(table)).name).toBe('app_notes');
    expect(project(toDrizzle(table))).toEqual(project(rawTable));
  });
  it('the table builder and the table creator hand a columns callback the builders', () => {
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

describe('pg columns: only pg, mysql: schemas', () => {
  it('schema tables and views materialize schema-qualified, and toDrizzle(schema) too', () => {
    const shop = pgSchema('shop');
    const rawShop = dz.pgSchema('shop');
    const items = shop.table('items', {id: serial({primaryKey: true}), label: varchar('item_label', {length: 20})});
    const rawItems = rawShop.table('items', {id: dz.serial().primaryKey(), label: dz.varchar('item_label', {length: 20})});
    expect(project(toDrizzle(items))).toEqual(project(rawItems));
    expect(dz.getTableConfig(toDrizzle(items)).schema).toBe('shop');
    const view = shop.view('item_view', {label: varchar({length: 20})}).as(sql`select label from items`);
    const rawView = rawShop.view('item_view', {label: dz.varchar({length: 20})}).as(dzSql`select label from items`);
    expect(projectView(toDrizzle(view), false)).toEqual(projectView(rawView, false));
    expect(dz.getViewConfig(toDrizzle(view)).schema).toBe('shop');
    const materialized = shop.materializedView('item_mview', {label: varchar({length: 20})}).existing();
    const rawMaterialized = rawShop.materializedView('item_mview', {label: dz.varchar({length: 20})}).existing();
    expect(projectView(toDrizzle(materialized), true)).toEqual(projectView(rawMaterialized, true));
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
  it('only pg: schema enums and sequences materialize like raw drizzle', () => {
    const shop = pgSchema('shop');
    const rawShop = dz.pgSchema('shop');
    const status = shop.enum('status', ['on', 'off']);
    const rawStatus = rawShop.enum('status', ['on', 'off']);
    const flags = shop.table('flags', {status: status('state', {notNull: true})});
    const rawFlags = rawShop.table('flags', {status: rawStatus('state').notNull()});
    expect(project(toDrizzle(flags))).toEqual(project(rawFlags));
    const dzStatus = toDrizzle(status);
    expect([dzStatus.enumName, dzStatus.enumValues, dzStatus.schema]).toEqual(['status', ['on', 'off'], 'shop']);
    const ids = shop.sequence('ids', {startWith: 10});
    expect(toDrizzle(ids)).toEqual(rawShop.sequence('ids', {startWith: 10}));
    expect(toDrizzle(ids)).toMatchObject({seqName: 'ids', schema: 'shop', seqOptions: {startWith: 10}});
  });
  it('only pg: a schema enum object exposes its values, as the top-level enum does', () => {
    const level = pgSchema('shop').enum('level', {Low: 'low', High: 'high'} as const);
    expect(level.enumValues).toEqual(['low', 'high']);
    expect(toDrizzle(level).enumValues).toEqual(['low', 'high']);
  });
});

describe('pg columns: one runtype id for builder and hand-written tables', () => {
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

describe('pg columns: views, enums and custom types', () => {
  it('a view materializes the same drizzle view as raw drizzle', () => {
    const view = pgView('active', {name: varchar('user_name', {length: 10, notNull: true})}).as(sql`select user_name from users`);
    const rawView = dz
      .pgView('active', {name: dz.varchar('user_name', {length: 10}).notNull()})
      .as(dzSql`select user_name from users`);
    expect(projectView(toDrizzle(view), false)).toEqual(projectView(rawView, false));
  });
  it('an existing view materializes as raw drizzle does', () => {
    const view = pgView('existing_view', {id: integer({notNull: true})}).existing();
    const rawView = dz.pgView('existing_view', {id: dz.integer().notNull()}).existing();
    expect(projectView(toDrizzle(view), false)).toEqual(projectView(rawView, false));
  });
  it('a view without columns fails naming the unsupported form', () => {
    expect(() => (pgView as (name: string) => unknown)('from_query')).toThrow(/without columns/);
    expect(() => (pgMaterializedView as (name: string) => unknown)('from_query')).toThrow(/without columns/);
  });
  it('a customType column materializes as raw drizzle does', () => {
    const params = {dataType: () => 'text', toDriver: (value: {x: number}) => JSON.stringify(value)};
    const custom = customType<{data: {x: number}}>(params);
    const rawCustom = dz.customType<{data: {x: number}}>(params);
    const table = pgTable('with_custom', {at: custom('at_point', {notNull: true})});
    const rawTable = dz.pgTable('with_custom', {at: rawCustom('at_point').notNull()});
    expect(project(toDrizzle(table))).toEqual(project(rawTable));
  });
  it('tableFromType refuses a custom column, whose runtime needs the customType callbacks', () => {
    type WithCustom = PgTable<'with_custom', {at: CustomCol<{x: number}, {notNull: true}>}>;
    expect(() => tableFromType<WithCustom>()).toThrow(/custom column, which needs its runtime handle/);
  });
  it('only pg, mysql: view options materialize as raw drizzle does', () => {
    const view = pgView('secure', {name: varchar('user_name', {length: 10})})
      .with({securityBarrier: true, checkOption: 'cascaded'})
      .as(sql`select user_name from users`);
    const rawView = dz
      .pgView('secure', {name: dz.varchar('user_name', {length: 10})})
      .with({securityBarrier: true, checkOption: 'cascaded'})
      .as(dzSql`select user_name from users`);
    expect(projectView(toDrizzle(view), false)).toEqual(projectView(rawView, false));
    expect(dz.getViewConfig(toDrizzle(view))).toMatchObject({with: {securityBarrier: true, checkOption: 'cascaded'}});
  });
  it('only pg, mysql: enum columns, tuple and object forms, materialize as raw drizzle does', () => {
    const mood = pgEnum('mood', ['sad', 'happy']);
    const level = pgEnum('level', {Low: 'low', High: 'high'} as const);
    const rawMood = dz.pgEnum('mood', ['sad', 'happy']);
    const rawLevel = dz.pgEnum('level', {Low: 'low', High: 'high'} as const);
    const table = pgTable('with_enum', {
      mood: mood('mood_col', {notNull: true}),
      level: level({default: ['low']}),
      bare: mood(),
    });
    const rawTable = dz.pgTable('with_enum', {
      mood: rawMood('mood_col').notNull(),
      level: rawLevel().default('low'),
      bare: rawMood(),
    });
    expect(project(toDrizzle(table))).toEqual(project(rawTable));
  });
  it('only pg, mysql: tableFromType refuses an enum column, whose runtime needs the enum values', () => {
    type WithEnum = PgTable<'with_enum', {mood: PgEnumCol<['sad', 'happy'], {notNull: true}>}>;
    type WithEnumObject = PgTable<'with_enum', {mood: PgEnumObjectCol<{Sad: 'sad'}>}>;
    expect(() => tableFromType<WithEnum>()).toThrow(/enum column, which needs its runtime handle/);
    expect(() => tableFromType<WithEnumObject>()).toThrow(/enum column, which needs its runtime handle/);
  });
  it('only pg: a materialized view materializes as raw drizzle does', () => {
    const view = pgMaterializedView('totals', {total: integer({notNull: true})})
      .with({fillfactor: 90})
      .using('heap')
      .tablespace('fast_space')
      .withNoData()
      .as(sql`select count(*) as total from users`);
    const rawView = dz
      .pgMaterializedView('totals', {total: dz.integer().notNull()})
      .with({fillfactor: 90})
      .using('heap')
      .tablespace('fast_space')
      .withNoData()
      .as(dzSql`select count(*) as total from users`);
    expect(projectView(toDrizzle(view), true)).toEqual(projectView(rawView, true));
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

describe('pg columns: one column shape is one runtype entry', () => {
  // Why columns carry no db name: a shape reused across tables reflects to ONE node.
  const columnId = (table: ReflectedNode, key: string) =>
    table.children!.find((member) => member.name === 'columns')!.child!.children!.find((member) => member.name === key)!.child!
      .id;
  it('the same column in two tables reflects to one id', () => {
    type Orders = PgTable<'orders', {total: Integer<{notNull: true}>}, [], {total: 'order_total'}>;
    type Items = PgTable<'items', {qty: Integer<{notNull: true}>}>;
    expect(columnId(getRunType<Orders>() as ReflectedNode, 'total')).toBe(columnId(getRunType<Items>() as ReflectedNode, 'qty'));
  });
});

describe('pg columns: builder tables reflect on their own', () => {
  // A column type carries no methods: the runtype id walks method return types (marker-self-instantiating-generic), alias args included.
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

describe('pg columns: only pg: row level security', () => {
  it('enableRLS on a builder table reaches drizzle', () => {
    const secured = pgTable('secured', {id: serial({primaryKey: true})}).enableRLS();
    const rawSecured = dz.pgTable('secured', {id: dz.serial().primaryKey()}).enableRLS();
    expect(dz.getTableConfig(toDrizzle(secured)).enableRLS).toBe(true);
    expect(project(toDrizzle(secured))).toEqual(project(rawSecured));
    expect(dz.getTableConfig(toDrizzle(pgTable('open', {id: serial()}))).enableRLS).toBe(false);
  });
});

// drizzle's array form AND its older keyed-object one, which its own suites still write; the array may also group.
describe('pg columns: extraConfig forms', () => {
  const columns = () => ({id: uuid('id', {primaryKey: true}), owner: text('owner', {notNull: true})});
  const rawColumns = () => ({id: dz.uuid('id').primaryKey(), owner: dz.text('owner').notNull()});
  it('the keyed-object form materializes as raw drizzle does, keeping every entry', () => {
    const keyed = pgTable('object_config', columns(), (t) => ({
      ownerIdx: index('object_config_owner_idx').on(t.owner),
      ownerUnique: unique('object_config_owner_unique').on(t.owner),
    }));
    const rawKeyed = dz.pgTable('object_config', rawColumns(), (t) => ({
      ownerIdx: dz.index('object_config_owner_idx').on(t.owner),
      ownerUnique: dz.unique('object_config_owner_unique').on(t.owner),
    }));
    expect(project(toDrizzle(keyed))).toEqual(project(rawKeyed));
    const config = dz.getTableConfig(toDrizzle(keyed));
    expect(config.indexes.map((entry) => entry.config.name)).toEqual(['object_config_owner_idx']);
    expect(config.uniqueConstraints.map((entry) => entry.name)).toEqual(['object_config_owner_unique']);
  });
  it('a grouped array flattens one level, as drizzle does', () => {
    const grouped = pgTable('grouped_config', columns(), (t) => [
      [index('grouped_config_owner_idx').on(t.owner), unique('grouped_config_owner_unique').on(t.owner)],
    ]);
    const rawGrouped = dz.pgTable(
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
const people = pgTable('people', {
  id: uuid({primaryKey: true}),
  name: varchar({length: 100, notNull: true}),
  age: integer({notNull: true}),
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

describe('pg columns: models compile full-fidelity validators', () => {
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
