/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The pg table factories: drizzle-identical call shapes (columns as an object
// or a callback receiving the column helpers; extraConfig callback returning
// an array of entries), slim recorder returns. Nothing here imports drizzle:
// each table stores a buildTable closure that receives the injected context at
// materialization (toDrizzle, in ./drizzle.ts).

import type {
  AnyRtColumn,
  AnyRtTable,
  DrizzleContext,
  ReflectedNode,
  RtExtraColumn,
  RtTableMetaWithExtras,
  TableFromTypeOptions,
  TypedCols,
} from '@mionjs/drizzle-orm';
import type {EntryColRefs, TableEntry} from '@mionjs/drizzle-orm';
import {
  buildRtTableFromGraph,
  createRtTable,
  RtColumnRecorder,
  RtValueRecorder,
  RtViewBuilder,
  rtTableKey,
  rtValueKey,
} from '@mionjs/drizzle-orm';
import type {InjectRunTypeId} from '@ts-runtypes/core';
import {getRunType} from '@ts-runtypes/core';
import {pgColumnHelpers, type PgColumnHelpers} from './columns.ts';
import {requireColumns} from './views.ts';
import type {} from './helpers.ts';

/** Pure-type twin of `pgTable(name, columns, extraConfig?)`: a table declared
 *  entirely as a type, from the column types (Varchar, Uuid, ...), modifier
 *  markers (NotNull, PrimaryKey, ...) and, for the extraConfig road, a tuple
 *  of table entries (IndexEntry, CheckEntry, ... or the raw TableEntry
 *  carrier). Normalizes to the same RtTable shape the builders produce, so
 *  models and refinement work unchanged; materialize with tableFromType. */
export type PgTable<TName extends string, Cols extends object, Extras extends readonly object[] = []> = PgBuilderTable<
  TName,
  TypedCols<Cols>,
  Extras
>;

/** A pg table whose columns are ALREADY normalized: what pgTable() returns, and
 *  what PgTable resolves to once it has normalized an authored columns record.
 *  Its own type alias rather than an extra type parameter on PgTable, because a
 *  parameter the factories fill with the same Cols they pass in slot two makes
 *  declaration emit print the whole columns record TWICE in every consumer's
 *  .d.ts (measured: it nearly doubles the emitted table type). */
export type PgBuilderTable<TName extends string, Cols extends object, Extras extends readonly object[] = []> = Cols & {
  readonly [rtTableKey]: RtTableMetaWithExtras<TName, Cols, Extras>;
  // Same object as the meta key, never a third intersection member: a declared
  // table pays one property, not another object (type-budget sensitive).
  enableRLS(): PgTableWithRLS<TName, Cols, Extras>;
};

/** A pg table with row level security on: the same table minus enableRLS, so it
 *  cannot be enabled twice. Mirrors drizzle's own `Omit<..., 'enableRLS'>`. */
export type PgTableWithRLS<TName extends string, Cols extends object, Extras extends readonly object[] = []> = Cols & {
  readonly [rtTableKey]: RtTableMetaWithExtras<TName, Cols, Extras>;
};

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
 *  and refineTableType treat it exactly like a pgTable() result. The type
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
export function tableFromType<T extends AnyRtTable>(options?: TableFromTypeOptions<T>, id?: InjectRunTypeId<T>): T {
  const runType = getRunType<T>(undefined, id);
  if (options !== undefined) return buildRtTableFromGraph(runType as ReflectedNode, pgBuildTable, options) as T;
  let slimTable = fromTypeTables.get(runType.id);
  if (slimTable === undefined) {
    slimTable = buildRtTableFromGraph(runType as ReflectedNode, pgBuildTable);
    fromTypeTables.set(runType.id, slimTable);
  }
  return slimTable as T;
}

/** The extraConfig view of the table's columns: the columns themselves plus
 *  the index-position decorators (asc/desc/nullsFirst/nullsLast/op). */
export type PgExtraConfigColumns<Cols> = {[K in keyof Cols]: Cols[K] & RtExtraColumn};

/** ONE entry in a table's extraConfig: an index, a constraint or a policy from
 *  this package; a REAL drizzle entry passed straight through (what a provider
 *  helper returns — crudPolicy, the supabase roles); or a GROUP of either, which
 *  drizzle flattens one level at build time.
 *
 *  `object`, not a union with PgEntryBrand: that brand's only member is optional,
 *  which makes it a WEAK type, and TypeScript rejects an object with nothing in
 *  common with a weak type — so a real drizzle entry could never be passed
 *  without a cast. This module never imports drizzle, so there is no name to
 *  give one. The recorder passes anything it does not recognise straight to
 *  drizzle, so the type says exactly what the runtime does. */
export type PgExtraConfigEntry = object;

/** drizzle accepts BOTH shapes from an extraConfig callback: the array form and
 *  its older keyed-object one. Its own suites still write both, so both are
 *  recorded and replayed unchanged. */
export type PgExtraConfigFn<Cols> = (
  self: PgExtraConfigColumns<Cols>
) => readonly PgExtraConfigEntry[] | Record<string, PgExtraConfigEntry>;

type ColumnsArg<Cols> = Cols | ((helpers: PgColumnHelpers) => Cols);

function resolveColumns<Cols>(columns: ColumnsArg<Cols>): Cols {
  return typeof columns === 'function' ? (columns as (helpers: PgColumnHelpers) => Cols)(pgColumnHelpers) : columns;
}

/** The pg buildTable closure (also used by tableFromType in ./drizzle.ts). */
export function pgBuildTable(
  context: DrizzleContext,
  name: string,
  builders: Record<string, unknown>,
  extraReplay?: (dzExtraColumns: Record<string, unknown>) => unknown[] | Record<string, unknown>
): unknown {
  return extraReplay
    ? context.ns.pgTable(name as never, builders as never, extraReplay as never)
    : context.ns.pgTable(name as never, builders as never);
}

/** Records the table; returns the slim table typed as PgTable (one public
 *  name for both roads), NOT drizzle's own table. The real drizzle table is
 *  built on demand by toDrizzle() from the ./drizzle subpath. */
export function pgTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: Cols,
  extraConfig?: PgExtraConfigFn<Cols>
): PgBuilderTable<TName, Cols>;
export function pgTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: (helpers: PgColumnHelpers) => Cols,
  extraConfig?: PgExtraConfigFn<Cols>
): PgBuilderTable<TName, Cols>;
export function pgTable(name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) {
  return createRtTable(name, resolveColumns(columns), extraConfig as never, pgBuildTable);
}

/** Drizzle's pgTableCreator: a pgTable with a table-name mapper, recorded. */
export function pgTableCreator(customizeTableName: (name: string) => string) {
  const creator = new RtValueRecorder('pgTableCreator', [customizeTableName]);
  function createTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
    name: TName,
    columns: Cols,
    extraConfig?: PgExtraConfigFn<Cols>
  ): PgBuilderTable<TName, Cols>;
  function createTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
    name: TName,
    columns: (helpers: PgColumnHelpers) => Cols,
    extraConfig?: PgExtraConfigFn<Cols>
  ): PgBuilderTable<TName, Cols>;
  function createTable(name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) {
    return createRtTable(name, resolveColumns(columns), extraConfig as never, (context, tableName, builders, extraReplay) => {
      const drizzleCreator = creator.toDrizzleValue(context) as (...a: unknown[]) => unknown;
      return extraReplay ? drizzleCreator(tableName, builders, extraReplay) : drizzleCreator(tableName, builders);
    });
  }
  return createTable;
}

// ── pgSchema ─────────────────────────────────────────────────────────────────

export interface PgSequenceOptions {
  increment?: number | string;
  minValue?: number | string;
  maxValue?: number | string;
  startWith?: number | string;
  cache?: number | string;
  cycle?: boolean;
}
/** Opaque handle for a recorded pg sequence; materialize it with toDrizzle. */
export interface PgSequence {
  readonly seqName: string | undefined;
}

export interface PgSchema<TSchemaName extends string = string> {
  readonly schemaName: TSchemaName;
  table: typeof pgTable;
  enum: typeof import('./helpers.ts').pgEnum;
  sequence(name: string, options?: PgSequenceOptions): PgSequence;
  view: typeof import('./views.ts').pgView;
  materializedView: typeof import('./views.ts').pgMaterializedView;
}

export function pgSchema<TSchemaName extends string>(schemaName: TSchemaName): PgSchema<TSchemaName> {
  const schema = new RtValueRecorder('pgSchema', [schemaName]);

  function schemaTable(name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) {
    return createRtTable(name, resolveColumns(columns), extraConfig as never, (context, tableName, builders, extraReplay) => {
      const drizzleSchema = schema.toDrizzleValue(context) as {table: (...a: unknown[]) => unknown};
      return extraReplay ? drizzleSchema.table(tableName, builders, extraReplay) : drizzleSchema.table(tableName, builders);
    });
  }

  function schemaEnum(enumName: string, values: readonly string[]) {
    return makeEnumFactory(new RtValueRecorder('enum', [enumName, values], schema), enumName, values);
  }

  // A schema-scoped view replays as schema.view(...) / schema.materializedView(...)
  // instead of the namespace function, the same way schemaTable does.
  function schemaView(name: string, columns?: Record<string, unknown>) {
    return new RtViewBuilder(name, requireColumns('pgSchema(...).view', name, columns), (context, viewName, builders) =>
      (schema.toDrizzleValue(context) as {view: (...a: unknown[]) => unknown}).view(viewName, builders)
    ) as never;
  }

  function schemaMaterializedView(name: string, columns?: Record<string, unknown>) {
    return new RtViewBuilder(
      name,
      requireColumns('pgSchema(...).materializedView', name, columns),
      (context, viewName, builders) =>
        (schema.toDrizzleValue(context) as {materializedView: (...a: unknown[]) => unknown}).materializedView(viewName, builders)
    ) as never;
  }

  function schemaSequence(name: string, options?: PgSequenceOptions): PgSequence {
    const sequence = new RtValueRecorder('sequence', options === undefined ? [name] : [name, options], schema);
    return {seqName: name, [rtValueKey]: sequence} as PgSequence;
  }

  return {
    schemaName,
    table: schemaTable as typeof pgTable,
    enum: schemaEnum as PgSchema<TSchemaName>['enum'],
    sequence: schemaSequence,
    view: schemaView as PgSchema<TSchemaName>['view'],
    materializedView: schemaMaterializedView as PgSchema<TSchemaName>['materializedView'],
    [rtValueKey]: schema,
  } as PgSchema<TSchemaName>;
}

/** Shared by pgEnum and pgSchema(...).enum: a factory handle producing slim
 *  enum columns whose materializer calls the real (memoized) drizzle enum. */
export function makeEnumFactory(recorder: RtValueRecorder, enumName: string, values: readonly string[]) {
  const enumFactory = Object.assign(
    (...columnArgs: unknown[]) =>
      new RtColumnRecorder((context) => {
        const drizzleEnum = recorder.toDrizzleValue(context) as (...a: unknown[]) => unknown;
        return drizzleEnum(...columnArgs);
      }) as never,
    {enumName, enumValues: values as never}
  );
  (enumFactory as unknown as Record<symbol, unknown>)[rtValueKey] = recorder;
  return enumFactory;
}
