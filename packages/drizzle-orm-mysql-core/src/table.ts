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

/** A mysql table: ONE type for both roads, since TypedCols passes an already-branded record through,
 *  so a mysqlTable() result and a `MysqlTable<'users', {id: Int<'id'>}>` declaration land on one type. */
export interface MysqlTable<TName extends string, Cols extends object, Extras extends readonly object[] = []>
  extends RtTableMeta<TName, TypedCols<Cols>, Extras>, RtTableBrand<'mysql'> {}

/** What this package's toDrizzle and tableFromType take, so another dialect's table is a compile
 *  error rather than a missing-function crash at materialization. */
export type AnyMysqlTable = MysqlTable<string, Record<string, AnyRtColumn>, readonly object[]>;
/** Any mysql view, the twin of AnyMysqlTable. */
export type AnyMysqlView = import('./views.ts').MysqlSlimView<string, Record<string, AnyRtColumn>>;

// Friendly aliases over the TableEntry carrier the runtime bridge and the convert program read.
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

// One slim table per reflected type id, so repeated calls share one materialized drizzle table.
const fromTypeTables = new Map<string, object>();

/** Runtime twin of a TYPE-defined table, typed as the table type itself, so toDrizzle, the models
 *  and refineTableType treat it exactly like a mysqlTable() result.
 *  The type argument is resolved by the build (@mionjs/devtools must be active); dynamic callers
 *  holding a resolved RunType graph use buildRtTableFromGraph from @mionjs/drizzle-orm instead.
 *  Columns using References need the referenced tables in options.tables, runtime-callback markers
 *  take theirs from options.runtime.
 *  A call WITH options is not memoized: two tables of the same type can carry different callbacks
 *  or referenced tables, and sharing would hand the second one the first one's. */
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
/** ONE entry in a table's extraConfig: an index or a constraint from this package; a REAL drizzle
 *  entry passed straight through; or a GROUP of either, which drizzle flattens one level at build time.
 *  `object`, not a union with MyEntryBrand: that brand's only member is optional, which makes it a
 *  WEAK type, and TypeScript would then reject a real drizzle entry without a cast. The recorder
 *  passes anything it does not recognise straight to drizzle, so the type matches the runtime. */
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

/** Records the table and returns the SLIM table, not drizzle's own: toDrizzle() from the ./drizzle subpath builds that. */
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
  // A schema-scoped view replays as schema.view(...), not the namespace function, as schemaTable does.
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
