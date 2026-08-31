/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The mysql table factories: drizzle-identical call shapes, slim recorder
// returns. Nothing here imports drizzle; the buildTable closures receive the
// injected context at materialization (toDrizzle, in ./drizzle.ts).

import type {
  AnyRtColumn,
  DrizzleContext,
  ReflectedNode,
  RtExtraColumn,
  RtTableBrand,
  RtTableMeta,
  TableFromTypeOptions,
  TypedCols,
} from '@mionjs/drizzle-orm';
import type {EntryColRefs, TableEntry} from '@mionjs/drizzle-orm';
import {buildRtTableFromGraph, createRtTable, RtValueRecorder, RtViewBuilder, rtValueKey} from '@mionjs/drizzle-orm';
import type {InjectRunTypeId} from '@mionjs/run-types';
import {getRunType} from '@mionjs/run-types';
import {mysqlColumnHelpers, type MySqlColumnHelpers} from './columns.ts';
import {requireColumns} from './views.ts';
import type {} from './helpers.ts';

/** A mysql table: the metadata and nothing wrapped around it.
 *
 *  ONE type for both roads. `mysqlTable('users', {...})` returns it with columns
 *  the builders already branded, and `MysqlTable<'users', {id: Int<'id'>}>`
 *  declares the same thing from the column TYPES; TypedCols passes an
 *  already-branded record straight through, so the two land on one type.
 *
 *  It used to be two (MysqlTable normalizing, MysqlBuilderTable pre-normalized)
 *  to save the builder road a TypedCols pass. That is worth about 5
 *  instantiations a table and it is not worth two shapes: every table in the
 *  codebase reads the same way, and nothing has to know which road declared it. */
export interface MysqlTable<TName extends string, Cols extends object, Extras extends readonly object[] = []>
  extends RtTableMeta<TName, TypedCols<Cols>, Extras>, RtTableBrand<'mysql'> {}

/** Any mysql table, whatever its name and columns. What this package's toDrizzle
 *  and tableFromType take, so another dialect's table is a compile error rather
 *  than a missing-function crash at materialization. */
export type AnyMysqlTable = MysqlTable<string, Record<string, AnyRtColumn>, readonly object[]>;
/** Any mysql view, the twin of AnyMysqlTable. */
export type AnyMysqlView = import('./views.ts').MysqlSlimView<string, Record<string, AnyRtColumn>>;

// The friendly per-helper entry aliases: each expands to the TableEntry
// carrier the runtime bridge and the convert program read mechanically.
/** `index(name).on(...columns by record key)`. */
export type IndexEntry<Name extends string, On extends readonly string[]> = TableEntry<'index', [Name], {on: EntryColRefs<On>}>;
/** `uniqueIndex(name).on(...)`. */
export type UniqueIndexEntry<Name extends string, On extends readonly string[]> = TableEntry<
  'uniqueIndex',
  [Name],
  {on: EntryColRefs<On>}
>;
/** `unique(name).on(...)`. */
export type UniqueEntry<Name extends string, On extends readonly string[]> = TableEntry<'unique', [Name], {on: EntryColRefs<On>}>;
/** `check(name, sql\`...\`)` — literal sql only. */
export type CheckEntry<Name extends string, SqlValue> = TableEntry<'check', [Name, SqlValue]>;
/** `foreignKey({name, columns, foreignColumns})`: this table's columns by
 *  record key, the foreign ones by table DB name + key (resolved through
 *  tableFromType deps). */
export type ForeignKeyEntry<
  Name extends string,
  Columns extends readonly string[],
  ForeignTable extends string,
  ForeignColumns extends readonly string[],
> = TableEntry<
  'foreignKey',
  [{name: Name; columns: EntryColRefs<Columns>; foreignColumns: ForeignTableRefs<ForeignTable, ForeignColumns>}]
>;
/** `primaryKey({name?, columns})` — the composite form. */
export type PrimaryKeyEntry<Name extends string, Columns extends readonly string[]> = TableEntry<
  'primaryKey',
  [{name: Name; columns: EntryColRefs<Columns>}]
>;
type ForeignTableRefs<Table extends string, Keys extends readonly string[]> = {[I in keyof Keys]: {table: Table; col: Keys[I]}};

// Rebuilt slim tables, one per reflected table id, so repeated calls share one
// slim table and therefore one materialized drizzle table.
const fromTypeTables = new Map<string, object>();

/** Runtime twin of a TYPE-defined table: rebuild the slim table from the
 *  reflected graph, typed as the table type itself — so toDrizzle, the models
 *  and refineTableType treat it exactly like a mysqlTable() result. The type
 *  argument is resolved by the build (ts-runtypes-devtools must be active);
 *  dynamic callers holding a resolved RunType graph use the lower-level
 *  buildRtTableFromGraph from @mionjs/drizzle-orm instead. A table whose
 *  columns use References needs the referenced tables in options.tables;
 *  runtime-callback markers take theirs from options.runtime. The no-options
 *  form is memoized, one slim table per type id, so repeated calls share one
 *  materialized drizzle table. A call WITH options builds a fresh one, the way
 *  a builder call does: two tables of the same type can carry different
 *  callbacks or different referenced tables, and sharing would silently hand
 *  the second one the first one's. */
export function tableFromType<T extends AnyMysqlTable>(options?: TableFromTypeOptions<T>, id?: InjectRunTypeId<T>): T {
  const runType = getRunType<T>(undefined, id);
  if (options !== undefined) return buildRtTableFromGraph(runType as ReflectedNode, mysqlBuildTable, options, 'mysql') as T;
  let slimTable = fromTypeTables.get(runType.id);
  if (slimTable === undefined) {
    slimTable = buildRtTableFromGraph(runType as ReflectedNode, mysqlBuildTable, undefined, 'mysql');
    fromTypeTables.set(runType.id, slimTable);
  }
  return slimTable as T;
}

/** The extraConfig view of the table's columns. */
export type MyExtraConfigColumns<Cols> = {[K in keyof Cols]: Cols[K] & RtExtraColumn};
/** ONE entry in a table's extraConfig: an index, a constraint or a policy from
 *  this package; a REAL drizzle entry passed straight through (what a provider
 *  helper returns — crudPolicy, the supabase roles); or a GROUP of either, which
 *  drizzle flattens one level at build time.
 *
 *  `object`, not a union with MyEntryBrand: that brand's only member is optional,
 *  which makes it a WEAK type, and TypeScript rejects an object with nothing in
 *  common with a weak type — so a real drizzle entry could never be passed
 *  without a cast. This module never imports drizzle, so there is no name to
 *  give one. The recorder passes anything it does not recognise straight to
 *  drizzle, so the type says exactly what the runtime does. */
export type MyExtraConfigEntry = object;

/** drizzle accepts BOTH shapes from an extraConfig callback: the array form and
 *  its older keyed-object one. Its own suites still write both, so both are
 *  recorded and replayed unchanged. */
export type MyExtraConfigFn<Cols> = (
  self: MyExtraConfigColumns<Cols>
) => readonly MyExtraConfigEntry[] | Record<string, MyExtraConfigEntry>;

type ColumnsArg<Cols> = Cols | ((helpers: MySqlColumnHelpers) => Cols);

function resolveColumns<Cols>(columns: ColumnsArg<Cols>): Cols {
  return typeof columns === 'function' ? (columns as (helpers: MySqlColumnHelpers) => Cols)(mysqlColumnHelpers) : columns;
}

/** The mysql buildTable closure (also used by tableFromType). */
export function mysqlBuildTable(
  context: DrizzleContext,
  name: string,
  builders: Record<string, unknown>,
  extraReplay?: (dzExtraColumns: Record<string, unknown>) => unknown[] | Record<string, unknown>
): unknown {
  return extraReplay
    ? context.ns.mysqlTable(name as never, builders as never, extraReplay as never)
    : context.ns.mysqlTable(name as never, builders as never);
}

/** Records the table; returns the slim table typed as MysqlTable (one public
 *  name for both roads), NOT drizzle's own table. The real drizzle table is
 *  built on demand by toDrizzle() from the ./drizzle subpath. */
export function mysqlTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: Cols,
  extraConfig?: MyExtraConfigFn<Cols>
): MysqlTable<TName, Cols>;
export function mysqlTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: (helpers: MySqlColumnHelpers) => Cols,
  extraConfig?: MyExtraConfigFn<Cols>
): MysqlTable<TName, Cols>;
export function mysqlTable(name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) {
  return createRtTable(name, resolveColumns(columns), extraConfig as never, mysqlBuildTable);
}

/** Drizzle's mysqlTableCreator: a mysqlTable with a table-name mapper, recorded. */
export function mysqlTableCreator(customizeTableName: (name: string) => string) {
  const creator = new RtValueRecorder('mysqlTableCreator', [customizeTableName]);
  function createTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
    name: TName,
    columns: Cols,
    extraConfig?: MyExtraConfigFn<Cols>
  ): MysqlTable<TName, Cols>;
  function createTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
    name: TName,
    columns: (helpers: MySqlColumnHelpers) => Cols,
    extraConfig?: MyExtraConfigFn<Cols>
  ): MysqlTable<TName, Cols>;
  function createTable(name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) {
    return createRtTable(name, resolveColumns(columns), extraConfig as never, (context, tableName, builders, extraReplay) => {
      const drizzleCreator = creator.toDrizzleValue(context) as (...a: unknown[]) => unknown;
      return extraReplay ? drizzleCreator(tableName, builders, extraReplay) : drizzleCreator(tableName, builders);
    });
  }
  return createTable;
}

export interface MySqlSchema<TSchemaName extends string = string> {
  readonly schemaName: TSchemaName;
  table: typeof mysqlTable;
  view: typeof import('./views.ts').mysqlView;
}

export function mysqlSchema<TSchemaName extends string>(schemaName: TSchemaName): MySqlSchema<TSchemaName> {
  const schema = new RtValueRecorder('mysqlSchema', [schemaName]);
  function schemaTable(name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) {
    return createRtTable(name, resolveColumns(columns), extraConfig as never, (context, tableName, builders, extraReplay) => {
      const drizzleSchema = schema.toDrizzleValue(context) as {table: (...a: unknown[]) => unknown};
      return extraReplay ? drizzleSchema.table(tableName, builders, extraReplay) : drizzleSchema.table(tableName, builders);
    });
  }
  // A schema-scoped view replays as schema.view(...) instead of the namespace
  // function, the same way schemaTable does.
  function schemaView(name: string, columns?: Record<string, unknown>) {
    return new RtViewBuilder(name, requireColumns('mysqlSchema(...).view', name, columns), (context, viewName, builders) =>
      (schema.toDrizzleValue(context) as {view: (...a: unknown[]) => unknown}).view(viewName, builders)
    ) as never;
  }

  return {
    schemaName,
    table: schemaTable as typeof mysqlTable,
    view: schemaView as MySqlSchema<TSchemaName>['view'],
    [rtValueKey]: schema,
  } as MySqlSchema<TSchemaName>;
}
