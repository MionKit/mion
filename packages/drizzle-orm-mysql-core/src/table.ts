/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The mysql table factories: drizzle's call shapes, slim recorder returns. The table type holds shared nameless
// columns plus a names map, so a mysqlTable() result and a hand-written `MysqlTable<'users', {...}>` are one type.
// Nothing here imports drizzle; the buildTable closures receive the injected context at materialization (./drizzle.ts).

import type {
  AnyColumn,
  DrizzleContext,
  EntryColRefs,
  NoNames,
  ReflectedNode,
  RtExtraColumn,
  RtTableBrand,
  RtTableMeta,
  TableEntry,
  TableFromTypeOptions,
  rtColNameKey,
  rtNamedColumnKey,
} from '@mionjs/drizzle-orm';
import {buildRtTableFromGraph, createRtTable, RtValueRecorder, RtViewBuilder, rtValueKey} from '@mionjs/drizzle-orm';
import type {InjectRunTypeId} from '@mionjs/run-types';
import {getRunType} from '@mionjs/run-types';
import {mysqlColumnHelpers, type MysqlColumnHelpers} from './columns.ts';
import {requireColumns, type mysqlView} from './views.ts';

/** A mysql table: ONE type for a mysqlTable() result and a hand-written `MysqlTable<'users', {...}>`. */
export interface MysqlTable<TName extends string, Cols, Extras extends readonly object[] = [], Names = NoNames>
  extends RtTableMeta<TName, Cols, Extras, Names>, RtTableBrand<'mysql'> {}
export type AnyMysqlTable = MysqlTable<string, Record<string, AnyColumn>, readonly object[], object>;

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
/** `check(name, sql\`...\`)`, literal sql only. */
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
/** `primaryKey({name?, columns})`, the composite form. */
export type PrimaryKeyEntry<Name extends string, Columns extends readonly string[]> = TableEntry<
  'primaryKey',
  [{name: Name; columns: EntryColRefs<Columns>}]
>;
type ForeignTableRefs<Table extends string, Keys extends readonly string[]> = {[I in keyof Keys]: {table: Table; col: Keys[I]}};

// Maps are inline, never an alias: the resolver serializes an alias's type arguments, the builders' results.
/** A builders record's columns: each named result unwrapped to its column. */
export type LiftCols<Cols> = {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]};
type NameOf<C> = C extends {readonly [rtColNameKey]: infer Name} ? Name : undefined;

/** The extraConfig view of the table's columns: plus the index-position decorators. */
export type MysqlExtraConfigColumns<Cols> = {[K in keyof Cols]: Cols[K] & RtExtraColumn};
/** ONE extraConfig entry: an index or constraint from this package, a REAL drizzle entry passed straight through, or
 *  a group of either, which drizzle flattens one level. `object`: MyEntryBrand is a weak type and would reject a real
 *  drizzle entry. */
export type MysqlExtraConfigEntry = object;
/** drizzle accepts both the array form and its older keyed-object one; both are recorded and replayed unchanged. */
export type MysqlExtraConfigFn<Cols> = (
  self: MysqlExtraConfigColumns<Cols>
) => readonly MysqlExtraConfigEntry[] | Record<string, MysqlExtraConfigEntry>;

type ColumnsArg<Cols> = Cols | ((helpers: MysqlColumnHelpers) => Cols);

function resolveColumns(columns: ColumnsArg<Record<string, unknown>>): Record<string, unknown> {
  return typeof columns === 'function' ? columns(mysqlColumnHelpers) : columns;
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
export function mysqlTable<TName extends string, Cols extends Record<string, object>>(
  name: TName,
  columns: Cols,
  extraConfig?: MysqlExtraConfigFn<LiftCols<Cols>>
): MysqlTable<
  TName,
  {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
  [],
  {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
>;
export function mysqlTable<TName extends string, Cols extends Record<string, object>>(
  name: TName,
  columns: (helpers: MysqlColumnHelpers) => Cols,
  extraConfig?: MysqlExtraConfigFn<LiftCols<Cols>>
): MysqlTable<
  TName,
  {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
  [],
  {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
>;
export function mysqlTable(name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) {
  return createRtTable(name, resolveColumns(columns), extraConfig as never, mysqlBuildTable);
}

/** Drizzle's mysqlTableCreator: a mysqlTable with a table-name mapper, recorded. */
export function mysqlTableCreator(customizeTableName: (name: string) => string): typeof mysqlTable {
  const creator = new RtValueRecorder('mysqlTableCreator', [customizeTableName]);
  return ((name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) =>
    createRtTable(name, resolveColumns(columns), extraConfig as never, (context, tableName, builders, extraReplay) => {
      const drizzleCreator = creator.toDrizzleValue(context) as (...args: unknown[]) => unknown;
      return extraReplay ? drizzleCreator(tableName, builders, extraReplay) : drizzleCreator(tableName, builders);
    })) as typeof mysqlTable;
}

export interface MySqlSchema<TSchemaName extends string = string> {
  readonly schemaName: TSchemaName;
  table: typeof mysqlTable;
  view: typeof mysqlView;
}

export function mysqlSchema<TSchemaName extends string>(schemaName: TSchemaName): MySqlSchema<TSchemaName> {
  const schema = new RtValueRecorder('mysqlSchema', [schemaName]);
  const drizzleSchema = (context: DrizzleContext) =>
    schema.toDrizzleValue(context) as Record<string, (...args: unknown[]) => unknown>;
  function schemaTable(name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) {
    return createRtTable(name, resolveColumns(columns), extraConfig as never, (context, tableName, builders, extraReplay) =>
      extraReplay
        ? drizzleSchema(context).table(tableName, builders, extraReplay)
        : drizzleSchema(context).table(tableName, builders)
    );
  }
  // A schema-scoped view replays as schema.view(...), not the namespace function, as schemaTable does.
  function schemaView(name: string, columns?: Record<string, unknown>) {
    return new RtViewBuilder(name, requireColumns('mysqlSchema(...).view', name, columns), (context, viewName, builders) =>
      drizzleSchema(context).view(viewName, builders)
    ) as never;
  }
  return {
    schemaName,
    table: schemaTable as typeof mysqlTable,
    view: schemaView as MySqlSchema<TSchemaName>['view'],
    [rtValueKey]: schema,
  } as MySqlSchema<TSchemaName>;
}

// One slim table per reflected type id, so repeated calls share one materialized drizzle table.
const fromTypeTables = new Map<string, object>();

/** Runtime twin of a hand-written table, typed as the table type itself, so toDrizzle, the models and
 *  refineTableType treat it exactly like a mysqlTable() result. The type argument is resolved by the build
 *  (@mionjs/devtools must be active). References need the referenced tables in options.tables, runtime-callback
 *  markers take theirs from options.runtime. A call WITH options is not memoized: two tables of the same type can
 *  carry different callbacks or referenced tables. */
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
