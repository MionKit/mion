/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The sqlite table factories: drizzle-identical call shapes, slim recorder
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
import {buildRtTableFromGraph, createRtTable, RtValueRecorder} from '@mionjs/drizzle-orm';
import type {InjectRunTypeId} from '@mionjs/run-types';
import {getRunType} from '@mionjs/run-types';
import {sqliteColumnHelpers, type SQLiteColumnHelpers} from './columns.ts';
import type {} from './helpers.ts';

/** A sqlite table: the metadata and nothing wrapped around it.
 *
 *  ONE type for both roads. `sqliteTable('users', {...})` returns it with columns
 *  the builders already branded, and `SqliteTable<'users', {id: Int<'id'>}>`
 *  declares the same thing from the column TYPES; TypedCols passes an
 *  already-branded record straight through, so the two land on one type.
 *
 *  It used to be two (SqliteTable normalizing, SqliteBuilderTable pre-normalized)
 *  to save the builder road a TypedCols pass. That is worth about 5
 *  instantiations a table and it is not worth two shapes: every table in the
 *  codebase reads the same way, and nothing has to know which road declared it. */
export interface SqliteTable<TName extends string, Cols extends object, Extras extends readonly object[] = []>
  extends RtTableMeta<TName, TypedCols<Cols>, Extras>, RtTableBrand<'sqlite'> {}

/** Any sqlite table, whatever its name and columns. What this package's toDrizzle
 *  and tableFromType take, so another dialect's table is a compile error rather
 *  than a missing-function crash at materialization. */
export type AnySqliteTable = SqliteTable<string, Record<string, AnyRtColumn>, readonly object[]>;
/** Any sqlite view, the twin of AnySqliteTable. */
export type AnySqliteView = import('./views.ts').SqliteSlimView<string, Record<string, AnyRtColumn>>;

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
 *  and refineTableType treat it exactly like a sqliteTable() result. The
 *  type argument is resolved by the build (@mionjs/devtools must be
 *  active); dynamic callers holding a resolved RunType graph use the
 *  lower-level buildRtTableFromGraph from @mionjs/drizzle-orm instead. A
 *  table whose columns use References needs the referenced tables in
 *  options.tables; runtime-callback markers take theirs from options.runtime.
 *  The no-options form is memoized, one slim table per type id, so repeated
 *  calls share one materialized drizzle table. A call WITH options builds a
 *  fresh one, the way a builder call does: two tables of the same type can
 *  carry different callbacks or different referenced tables, and sharing would
 *  silently hand the second one the first one's. */
export function tableFromType<T extends AnySqliteTable>(options?: TableFromTypeOptions<T>, id?: InjectRunTypeId<T>): T {
  const runType = getRunType<T>(undefined, id);
  if (options !== undefined) return buildRtTableFromGraph(runType as ReflectedNode, sqliteBuildTable, options, 'sqlite') as T;
  let slimTable = fromTypeTables.get(runType.id);
  if (slimTable === undefined) {
    slimTable = buildRtTableFromGraph(runType as ReflectedNode, sqliteBuildTable, undefined, 'sqlite');
    fromTypeTables.set(runType.id, slimTable);
  }
  return slimTable as T;
}

/** The extraConfig view of the table's columns. */
export type SqliteExtraConfigColumns<Cols> = {[K in keyof Cols]: Cols[K] & RtExtraColumn};
/** ONE entry in a table's extraConfig: an index, a constraint or a policy from
 *  this package; a REAL drizzle entry passed straight through (what a provider
 *  helper returns — crudPolicy, the supabase roles); or a GROUP of either, which
 *  drizzle flattens one level at build time.
 *
 *  `object`, not a union with SqliteEntryBrand: that brand's only member is optional,
 *  which makes it a WEAK type, and TypeScript rejects an object with nothing in
 *  common with a weak type — so a real drizzle entry could never be passed
 *  without a cast. This module never imports drizzle, so there is no name to
 *  give one. The recorder passes anything it does not recognise straight to
 *  drizzle, so the type says exactly what the runtime does. */
export type SqliteExtraConfigEntry = object;

/** drizzle accepts BOTH shapes from an extraConfig callback: the array form and
 *  its older keyed-object one. Its own suites still write both, so both are
 *  recorded and replayed unchanged. */
export type SqliteExtraConfigFn<Cols> = (
  self: SqliteExtraConfigColumns<Cols>
) => readonly SqliteExtraConfigEntry[] | Record<string, SqliteExtraConfigEntry>;

type ColumnsArg<Cols> = Cols | ((helpers: SQLiteColumnHelpers) => Cols);

function resolveColumns<Cols>(columns: ColumnsArg<Cols>): Cols {
  return typeof columns === 'function' ? (columns as (helpers: SQLiteColumnHelpers) => Cols)(sqliteColumnHelpers) : columns;
}

/** The sqlite buildTable closure (also used by tableFromType). */
export function sqliteBuildTable(
  context: DrizzleContext,
  name: string,
  builders: Record<string, unknown>,
  extraReplay?: (dzExtraColumns: Record<string, unknown>) => unknown[] | Record<string, unknown>
): unknown {
  return extraReplay
    ? context.ns.sqliteTable(name as never, builders as never, extraReplay as never)
    : context.ns.sqliteTable(name as never, builders as never);
}

/** Records the table; returns the slim table typed as SqliteTable (one public
 *  name for both roads), NOT drizzle's own table. The real drizzle table is
 *  built on demand by toDrizzle() from the ./drizzle subpath. */
export function sqliteTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: Cols,
  extraConfig?: SqliteExtraConfigFn<Cols>
): SqliteTable<TName, Cols>;
export function sqliteTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: (helpers: SQLiteColumnHelpers) => Cols,
  extraConfig?: SqliteExtraConfigFn<Cols>
): SqliteTable<TName, Cols>;
export function sqliteTable(name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) {
  return createRtTable(name, resolveColumns(columns), extraConfig as never, sqliteBuildTable);
}

/** Drizzle's sqliteTableCreator: a sqliteTable with a table-name mapper, recorded. */
export function sqliteTableCreator(customizeTableName: (name: string) => string) {
  const creator = new RtValueRecorder('sqliteTableCreator', [customizeTableName]);
  function createTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
    name: TName,
    columns: Cols,
    extraConfig?: SqliteExtraConfigFn<Cols>
  ): SqliteTable<TName, Cols>;
  function createTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
    name: TName,
    columns: (helpers: SQLiteColumnHelpers) => Cols,
    extraConfig?: SqliteExtraConfigFn<Cols>
  ): SqliteTable<TName, Cols>;
  function createTable(name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) {
    return createRtTable(name, resolveColumns(columns), extraConfig as never, (context, tableName, builders, extraReplay) => {
      const drizzleCreator = creator.toDrizzleValue(context) as (...a: unknown[]) => unknown;
      return extraReplay ? drizzleCreator(tableName, builders, extraReplay) : drizzleCreator(tableName, builders);
    });
  }
  return createTable;
}
