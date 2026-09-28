/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// sqlite columns at run time: builder tables and hand-written table types against raw drizzle.

import {describe, it, expect} from 'vitest';
import {sql as dzSql} from 'drizzle-orm';
import * as dz from 'drizzle-orm/sqlite-core';
import {createValidateFn, getRunType, getRunTypeId} from '@mionjs/run-types';
import type {UUID} from '@mionjs/run-types/formats';
import type {InferInsertModel, InferSelectModel, ReflectedNode, RtTableMeta, Sql} from '@mionjs/drizzle-orm';
import {$type, refineTableType, rtTableBrand, sql, tableRef, type TableRef} from '@mionjs/drizzle-orm';
import type {
  AnySqliteTable,
  Blob,
  CheckEntry,
  CustomCol,
  ForeignKeyEntry,
  IndexEntry,
  Int,
  Integer,
  Numeric,
  Real,
  SqliteTable,
  Text,
  UniqueEntry,
  UniqueIndexEntry,
} from '../src/index.ts';
import {
  blob,
  check,
  customType,
  foreignKey,
  index,
  int,
  integer,
  numeric,
  primaryKey,
  real,
  sqliteTable,
  sqliteTableCreator,
  sqliteView,
  tableFromType,
  text,
  unique,
  uniqueIndex,
  view,
} from '../src/index.ts';
import {drizzle as proxyDb} from 'drizzle-orm/sqlite-proxy';
import {toDrizzle} from '../src/drizzle.ts';
import {project, projectView} from './tableSpecShared.ts';

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
const rawTeams = dz.sqliteTable('teams', {id: dz.integer().primaryKey()});
const rawMembers = dz.sqliteTable('members', {
  id: dz.integer().primaryKey(),
  teamId: dz.integer('team_id').references(() => rawTeams.id, {onDelete: 'cascade'}),
});
type MembersByRef = SqliteTable<
  'members',
  {id: Integer<{primaryKey: true}>; teamId: Integer<{references: [TableRef<Teams, 'id'>, {onDelete: 'cascade'}]}>},
  [],
  {teamId: 'team_id'}
>;
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

const point = customType<{data: string}>({dataType: () => 'text'});
const rawPoint = dz.customType<{data: string}>({dataType: () => 'text'});
const every = sqliteTable('every', {
  blob: blob({mode: 'json'}),
  customType: point({notNull: true}),
  int: int({default: [1]}),
  integer: integer({mode: 'timestamp_ms'}),
  numeric: numeric({mode: 'bigint'}),
  real: real({unique: true}),
  text: text({length: 10, enum: ['a', 'b']}),
});
const rawEvery = dz.sqliteTable('every', {
  blob: dz.blob({mode: 'json'}),
  customType: rawPoint().notNull(),
  int: dz.int().default(1),
  integer: dz.integer({mode: 'timestamp_ms'}),
  numeric: dz.numeric({mode: 'bigint'}),
  real: dz.real().unique(),
  text: dz.text({length: 10, enum: ['a', 'b']}),
});

describe('sqlite columns: same drizzle table on every road', () => {
  it('builders and raw drizzle materialize the same table', () => {
    expect(project(toDrizzle(users))).toEqual(project(rawUsers));
    expect(project(toDrizzle(wide))).toEqual(project(rawWide));
  });
  it('every builder materializes as raw drizzle does', () => {
    expect(project(toDrizzle(every))).toEqual(project(rawEvery));
    expect(dz.getTableConfig(toDrizzle(every)).columns).toHaveLength(7);
  });
  it('the dialect modifiers reach drizzle', () => {
    const columns = dz.getTableConfig(toDrizzle(users)).columns;
    expect(columns.find((column) => column.name === 'id')).toMatchObject({primary: true, autoIncrement: true, hasDefault: true});
    // An integer primary key is the rowid, so drizzle gives it a default even without autoIncrement.
    const plainPk = dz.getTableConfig(toDrizzle(sqliteTable('plain_pk', {id: integer({primaryKey: true})}))).columns;
    expect(plainPk[0]).toMatchObject({primary: true, autoIncrement: false, hasDefault: true});
    const textPk = dz.getTableConfig(toDrizzle(sqliteTable('text_pk', {key: text({primaryKey: true})}))).columns;
    expect(textPk[0]).toMatchObject({primary: true, hasDefault: false});
  });
  it('a generated column keeps its config', () => {
    const generated = sqliteTable('generated', {derived: text({generatedAlwaysAs: ['x', {mode: 'stored'}]})});
    const rawGenerated = dz.sqliteTable('generated', {derived: dz.text().generatedAlwaysAs('x', {mode: 'stored'})});
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
    type Slugs = SqliteTable<'slugs', {slug: Text<{length: 8; primaryKey: true; $defaultFn: true}>}>;
    const rawSlugs = dz.sqliteTable('slugs', {
      slug: dz
        .text({length: 8})
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
    type First = SqliteTable<'dup', {id: Integer; name: Text}>;
    type Second = SqliteTable<'dup', {id: Integer; firstName: Text}>;
    db.insert(toDrizzle(tableFromType<First>())).values({id: 1, name: 'a'}).toSQL();
    expect(db.insert(toDrizzle(tableFromType<Second>())).values({id: 1, firstName: 'b'}).toSQL().sql).toContain('firstName');
  });
  it('a literal sql default rebuilds from the type', () => {
    type Stamped = SqliteTable<'stamped', {at: Text<{default: [Sql<'CURRENT_TIMESTAMP'>]}>}>;
    const stamped = sqliteTable('stamped', {at: text({default: [sql`CURRENT_TIMESTAMP`]})});
    const rawStamped = dz.sqliteTable('stamped', {at: dz.text().default(dzSql`CURRENT_TIMESTAMP`)});
    expect(project(toDrizzle(stamped))).toEqual(project(rawStamped));
    expect(project(toDrizzle(tableFromType<Stamped>()))).toEqual(project(rawStamped));
  });
  it('foreignKey takes a tableRef() for the other table', () => {
    const withFk = sqliteTable('with_fk', {teamId: integer('team_id')}, (t) => [
      foreignKey({name: 'fk_team', columns: [t.teamId], foreignColumns: [tableRef(teams, 'id')]}).onDelete('cascade'),
    ]);
    const rawWithFk = dz.sqliteTable('with_fk', {teamId: dz.integer('team_id')}, (t) => [
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
    const indexed = sqliteTable('indexed', {a: integer('a', {notNull: true}), b: text('b')}, (t) => [
      index('idx_b').on(t.b),
      uniqueIndex('uidx_a')
        .on(t.a)
        .where(sql`a > 0`),
      unique('uq_ab').on(t.a, t.b),
      check('chk_a', sql`a > 0`),
      primaryKey({columns: [t.a, t.b]}),
    ]);
    const rawIndexed = dz.sqliteTable('indexed', {a: dz.integer('a').notNull(), b: dz.text('b')}, (t) => [
      dz.index('idx_b').on(t.b),
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
    sqliteTable('ordered', {a: integer('a')}, (t) => [
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
    const loose = sqliteTable('loose', {teamId: integer({references: [() => ({table: 'teams', column: 'id'})]})});
    expect(() => dz.getTableConfig(toDrizzle(loose)).foreignKeys[0]?.reference()).toThrowError(/tableRef\(table, column\)/);
  });
  it('a reference to a missing column fails with an actionable error', () => {
    type Typo = SqliteTable<'typo', {pid: Integer<{references: [{table: 'teams'; column: 'idd'}]}>}>;
    const teamsType = tableFromType<Teams>();
    const typo = toDrizzle(tableFromType<Typo>({tables: {teams: teamsType}}));
    expect(() => dz.getTableConfig(typo).foreignKeys[0]?.reference()).toThrowError(/references no column "idd" in table "teams"/);
  });
  it('a type reference with no table passed fails with an actionable error', () => {
    expect(() => tableFromType<Members>({})).toThrow(/pass it via tableFromType options: \{tables: \{teams: \.\.\.\}\}/);
  });
});

// Table-level extras on the type road: the extras tuple.
const extras = sqliteTable('extras_t', {a: integer({notNull: true}), b: text({length: 10}), pid: integer()}, (t) => [
  index('idx_a').on(t.a),
  uniqueIndex('uidx_b').on(t.b),
  unique('uq_ab').on(t.a, t.b),
  check('chk_a', sql`a >= 0`),
  foreignKey({name: 'fk_pid', columns: [t.pid], foreignColumns: [tableRef(teams, 'id')]}),
]);
type Extras = SqliteTable<
  'extras_t',
  {a: Integer<{notNull: true}>; b: Text<{length: 10}>; pid: Integer},
  [
    IndexEntry<'idx_a', ['a']>,
    UniqueIndexEntry<'uidx_b', ['b']>,
    UniqueEntry<'uq_ab', ['a', 'b']>,
    CheckEntry<'chk_a', Sql<'a >= 0'>>,
    ForeignKeyEntry<'fk_pid', ['pid'], 'teams', ['id']>,
  ]
>;

describe('sqlite columns: table-level extras on the type road', () => {
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
const runtimeBuilt = sqliteTable('runtime_t', {
  id: integer({primaryKey: true}),
  slug: text({length: 80, notNull: true, $defaultFn: [() => 'slug-1']}),
  counter: integer({$default: [() => 7]}),
  updatedAt: text('updated_at', {$onUpdate: [() => 'updated-now']}),
  touched: integer({$onUpdateFn: [() => 1]}),
});
type RuntimeTable = SqliteTable<
  'runtime_t',
  {
    id: Integer<{primaryKey: true}>;
    slug: Text<{length: 80; notNull: true; $defaultFn: true}>;
    counter: Integer<{$default: true}>;
    updatedAt: Text<{$onUpdate: true}>;
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

describe('sqlite columns: runtime callbacks', () => {
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
    type NoMarker = SqliteTable<'no_marker_runtime', {n: Integer}>;
    expect(() => tableFromType<NoMarker>({runtime: {n: {$onUpdate: () => 1}}})).toThrowError(
      /options\.runtime\.n\.\$onUpdate has no matching/
    );
  });
});

// A table carries the dialect that recorded it, so another dialect's table is a compile error, not a runtime crash.
// The foreign table is spelled here rather than imported: a dialect package must not depend on its siblings.
describe('sqlite columns: tables are typed to their dialect', () => {
  it('tags what the table builder and the table type produce with the dialect', () => {
    const table = sqliteTable('tagged', {id: integer({primaryKey: true})});
    const accepted: AnySqliteTable = table;
    const acceptedType: AnySqliteTable = {} as SqliteTable<'tagged', {id: Integer<{primaryKey: true}>}>;
    expect(accepted).toBe(table);
    expect(acceptedType).toBeDefined();
  });
  it('rejects another dialect table, as a value and as a type argument', () => {
    interface OtherDialect extends RtTableMeta<'users', {id: Integer}, []> {
      readonly [rtTableBrand]?: 'other';
    }
    // @ts-expect-error another dialect's table is not a sqlite table
    const rejected: AnySqliteTable = {} as OtherDialect;
    // @ts-expect-error and it cannot be rebuilt through this dialect's tableFromType either
    void tableFromType<OtherDialect>;
    expect(rejected).toBeDefined();
  });
});

describe('sqlite columns: table creators and the columns callback', () => {
  it('the table creator maps the table name like raw drizzle', () => {
    const create = sqliteTableCreator((name) => `app_${name}`);
    const rawCreate = dz.sqliteTableCreator((name) => `app_${name}`);
    const table = create('notes', {id: integer({primaryKey: true}), body: text('body_text', {notNull: true})});
    const rawTable = rawCreate('notes', {id: dz.integer().primaryKey(), body: dz.text('body_text').notNull()});
    expect(project(toDrizzle(table)).name).toBe('app_notes');
    expect(project(toDrizzle(table))).toEqual(project(rawTable));
  });
  it('the table builder and the table creator hand a columns callback the builders', () => {
    const create = sqliteTableCreator((name) => `app_${name}`);
    const byCallback = create('notes', (helpers) => ({
      id: helpers.int({primaryKey: true}),
      body: helpers.text({notNull: true}),
    }));
    const plain = sqliteTable('notes', (helpers) => ({id: helpers.int({primaryKey: true}), body: helpers.text({notNull: true})}));
    const rawColumns = () => ({id: dz.int().primaryKey(), body: dz.text().notNull()});
    expect(project(toDrizzle(plain))).toEqual(project(dz.sqliteTable('notes', rawColumns())));
    expect(project(toDrizzle(byCallback))).toEqual(
      project(dz.sqliteTableCreator((name) => `app_${name}`)('notes', rawColumns()))
    );
  });
});

describe('sqlite columns: one runtype id for builder and hand-written tables', () => {
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

// A blob column in buffer mode is the one column whose data is Node's Buffer; reflecting it once halted the build.
const blobs = sqliteTable('blobs', {
  id: integer('id', {primaryKey: true}),
  payload: blob('payload', {mode: 'buffer', notNull: true}),
  meta: blob('meta', {mode: 'json'}),
});
type Blobs = SqliteTable<
  'blobs',
  {id: Integer<{primaryKey: true}>; payload: Blob<{mode: 'buffer'; notNull: true}>; meta: Blob<{mode: 'json'}>}
>;
const rawBlobs = dz.sqliteTable('blobs', {
  id: dz.integer('id').primaryKey(),
  payload: dz.blob('payload', {mode: 'buffer'}).notNull(),
  meta: dz.blob('meta', {mode: 'json'}),
});

describe('sqlite columns: only sqlite: blob columns', () => {
  it('a blob table materializes as raw drizzle does, on both roads', () => {
    expect(project(toDrizzle(blobs))).toEqual(project(rawBlobs));
    expect(project(toDrizzle(tableFromType<Blobs>()))).toEqual(project(rawBlobs));
  });
  it('static form: a Buffer column resolves, one id for both spellings', () => {
    expect(getRunTypeId<InferSelectModel<Blobs>>()).toBeTruthy();
    expect(getRunTypeId<InferSelectModel<Blobs>>()).toBe(getRunTypeId<InferSelectModel<typeof blobs>>());
  });
  it('reflection form: a Buffer column resolves to the static form id', () => {
    const row = {id: 1, payload: Buffer.from('hi'), meta: null} as InferSelectModel<Blobs>;
    expect(getRunTypeId(row)).toBe(getRunTypeId<InferSelectModel<typeof blobs>>());
  });
});

describe('sqlite columns: views, enums and custom types', () => {
  it('a view materializes the same drizzle view as raw drizzle', () => {
    const byView = sqliteView('active', {name: text('user_name', {length: 10, notNull: true})}).as(
      sql`select user_name from users`
    );
    const rawView = dz
      .sqliteView('active', {name: dz.text('user_name', {length: 10}).notNull()})
      .as(dzSql`select user_name from users`);
    expect(projectView(toDrizzle(byView))).toEqual(projectView(rawView));
  });
  it('an existing view materializes as raw drizzle does', () => {
    const existing = sqliteView('existing_view', {id: integer({notNull: true})}).existing();
    const rawExisting = dz.sqliteView('existing_view', {id: dz.integer().notNull()}).existing();
    expect(projectView(toDrizzle(existing))).toEqual(projectView(rawExisting));
  });
  it('a view without columns fails naming the unsupported form', () => {
    expect(() => (sqliteView as (name: string) => unknown)('from_query')).toThrow(/without columns/);
  });
  it('a customType column materializes as raw drizzle does', () => {
    const params = {dataType: () => 'text', toDriver: (value: {x: number}) => JSON.stringify(value)};
    const custom = customType<{data: {x: number}}>(params);
    const rawCustom = dz.customType<{data: {x: number}}>(params);
    const table = sqliteTable('with_custom', {at: custom('at_point', {notNull: true})});
    const rawTable = dz.sqliteTable('with_custom', {at: rawCustom('at_point').notNull()});
    expect(project(toDrizzle(table))).toEqual(project(rawTable));
  });
  it('tableFromType refuses a custom column, whose runtime needs the customType callbacks', () => {
    type WithCustom = SqliteTable<'with_custom', {at: CustomCol<{x: number}, {notNull: true}>}>;
    expect(() => tableFromType<WithCustom>()).toThrow(/custom column, which needs its runtime handle/);
  });
  it('only sqlite: the view alias is the same factory', () => {
    expect(view).toBe(sqliteView);
    const byAlias = view('active', {name: text('user_name', {length: 10, notNull: true})}).as(sql`select user_name from users`);
    const rawView = dz
      .view('active', {name: dz.text('user_name', {length: 10}).notNull()})
      .as(dzSql`select user_name from users`);
    expect(projectView(toDrizzle(byAlias))).toEqual(projectView(rawView));
  });
});

describe('sqlite columns: one column shape is one runtype entry', () => {
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

describe('sqlite columns: builder tables reflect on their own', () => {
  // A column type carries no methods: the runtype id walks method return types (MKR009), alias args included.
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

// drizzle's array form AND its older keyed-object one, which its own suites still write; the array may also group.
describe('sqlite columns: extraConfig forms', () => {
  const columns = () => ({id: integer('id', {primaryKey: true}), owner: text('owner', {notNull: true})});
  const rawColumns = () => ({id: dz.integer('id').primaryKey(), owner: dz.text('owner').notNull()});
  it('the keyed-object form materializes as raw drizzle does, keeping every entry', () => {
    const keyed = sqliteTable('object_config', columns(), (t) => ({
      ownerIdx: index('object_config_owner_idx').on(t.owner),
      ownerUnique: unique('object_config_owner_unique').on(t.owner),
    }));
    const rawKeyed = dz.sqliteTable('object_config', rawColumns(), (t) => ({
      ownerIdx: dz.index('object_config_owner_idx').on(t.owner),
      ownerUnique: dz.unique('object_config_owner_unique').on(t.owner),
    }));
    expect(project(toDrizzle(keyed))).toEqual(project(rawKeyed));
    const config = dz.getTableConfig(toDrizzle(keyed));
    expect(config.indexes.map((entry) => entry.config.name)).toEqual(['object_config_owner_idx']);
    expect(config.uniqueConstraints.map((entry) => entry.name)).toEqual(['object_config_owner_unique']);
  });
  it('a grouped array flattens one level, as drizzle does', () => {
    const grouped = sqliteTable('grouped_config', columns(), (t) => [
      [index('grouped_config_owner_idx').on(t.owner), unique('grouped_config_owner_unique').on(t.owner)],
    ]);
    const rawGrouped = dz.sqliteTable(
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
const people = sqliteTable('people', {
  id: text({primaryKey: true, $type: $type<UUID>()}),
  name: text({length: 100, notNull: true}),
  age: integer({notNull: true}),
  role: text({enum: ['admin', 'user'], notNull: true}),
  bio: text(),
  createdAt: integer('created_at', {mode: 'timestamp', notNull: true, $defaultFn: [() => new Date()]}),
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

describe('sqlite columns: models compile full-fidelity validators', () => {
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
    expect(validatePerson({...validPerson, age: 20.5})).toBe(false);
    expect(validatePerson({...validPerson, role: 'root'})).toBe(false);
    expect(validatePerson({...validPerson, createdAt: 'not-a-date'})).toBe(false);
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
