/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The pg table factories: drizzle's call shapes (columns as an object or a callback receiving the column helpers,
// extraConfig returning entries), slim recorder returns. The table type holds shared nameless columns plus a names
// map, so a pgTable() result and a hand-written `PgTable<'users', {...}>` are one type. Nothing here imports drizzle:
// each table stores a buildTable closure that receives the injected context at materialization (./drizzle.ts).

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
import {pgColumnHelpers, type PgColumnHelpers} from './columns.ts';
import {makeEnumFactory, type pgEnum} from './helpers.ts';
import {requireColumns, type pgMaterializedView, type pgView} from './views.ts';

/** A pg table: ONE type for a pgTable() result and a hand-written `PgTable<'users', {...}>`. */
export interface PgTable<TName extends string, Cols, Extras extends readonly object[] = [], Names = NoNames>
  extends RtTableMeta<TName, Cols, Extras, Names>, RtTableBrand<'pg'> {
  enableRLS(): PgTableWithRLS<TName, Cols, Extras, Names>;
}
/** A pg table with row level security on: the same table minus enableRLS, as drizzle's own `Omit<..., 'enableRLS'>`. */
export interface PgTableWithRLS<TName extends string, Cols, Extras extends readonly object[] = [], Names = NoNames>
  extends RtTableMeta<TName, Cols, Extras, Names>, RtTableBrand<'pg'> {}
/** What this package's toDrizzle and tableFromType take, so another dialect's table is a compile error. */
export type AnyPgTable = PgTableWithRLS<string, Record<string, AnyColumn>, readonly object[], object>;

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
/** `foreignKey({name, columns, foreignColumns})`: this table's columns by record key, the foreign ones by table db
 *  name + key (resolved through tableFromType's options.tables). */
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

/** The extraConfig view of the table's columns: plus the index-position decorators (asc/desc/op). */
export type PgExtraConfigColumns<Cols> = {[K in keyof Cols]: Cols[K] & RtExtraColumn};
/** ONE extraConfig entry: an index, constraint or policy from this package, a REAL drizzle entry passed straight
 *  through (crudPolicy, the supabase roles), or a group of either, which drizzle flattens one level.
 *  `object`, not a union with PgEntryBrand: that brand is a weak type and would reject a real drizzle entry. */
export type PgExtraConfigEntry = object;
/** drizzle accepts both the array form and its older keyed-object one; both are recorded and replayed unchanged. */
export type PgExtraConfigFn<Cols> = (
  self: PgExtraConfigColumns<Cols>
) => readonly PgExtraConfigEntry[] | Record<string, PgExtraConfigEntry>;

type ColumnsArg<Cols> = Cols | ((helpers: PgColumnHelpers) => Cols);

function resolveColumns(columns: ColumnsArg<Record<string, unknown>>): Record<string, unknown> {
  return typeof columns === 'function' ? columns(pgColumnHelpers) : columns;
}

/** The pg buildTable closure (also used by tableFromType). */
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

/** Records the table and returns the SLIM table, not drizzle's own: toDrizzle() from the ./drizzle subpath builds that. */
export function pgTable<TName extends string, Cols extends Record<string, object>>(
  name: TName,
  columns: Cols,
  extraConfig?: PgExtraConfigFn<LiftCols<Cols>>
): PgTable<
  TName,
  {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
  [],
  {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
>;
export function pgTable<TName extends string, Cols extends Record<string, object>>(
  name: TName,
  columns: (helpers: PgColumnHelpers) => Cols,
  extraConfig?: PgExtraConfigFn<LiftCols<Cols>>
): PgTable<
  TName,
  {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
  [],
  {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
>;
export function pgTable(name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) {
  return createRtTable(name, resolveColumns(columns), extraConfig as never, pgBuildTable);
}

/** Drizzle's pgTableCreator: a pgTable with a table-name mapper, recorded. */
export function pgTableCreator(customizeTableName: (name: string) => string): typeof pgTable {
  const creator = new RtValueRecorder('pgTableCreator', [customizeTableName]);
  return ((name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) =>
    createRtTable(name, resolveColumns(columns), extraConfig as never, (context, tableName, builders, extraReplay) => {
      const drizzleCreator = creator.toDrizzleValue(context) as (...args: unknown[]) => unknown;
      return extraReplay ? drizzleCreator(tableName, builders, extraReplay) : drizzleCreator(tableName, builders);
    })) as typeof pgTable;
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
  view: typeof pgView;
  materializedView: typeof pgMaterializedView;
  enum: typeof pgEnum;
  sequence(name: string, options?: PgSequenceOptions): PgSequence;
}

export function pgSchema<TSchemaName extends string>(schemaName: TSchemaName): PgSchema<TSchemaName> {
  const schema = new RtValueRecorder('pgSchema', [schemaName]);
  const drizzleSchema = (context: DrizzleContext) =>
    schema.toDrizzleValue(context) as Record<string, (...args: unknown[]) => unknown>;

  function schemaTable(name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) {
    return createRtTable(name, resolveColumns(columns), extraConfig as never, (context, tableName, builders, extraReplay) =>
      extraReplay
        ? drizzleSchema(context).table(tableName, builders, extraReplay)
        : drizzleSchema(context).table(tableName, builders)
    );
  }
  function schemaEnum(enumName: string, values: readonly string[] | Record<string, string>) {
    return makeEnumFactory(new RtValueRecorder('enum', [enumName, values], schema), enumName, values);
  }
  // A schema-scoped view replays as schema.view(...), not the namespace function, as schemaTable does.
  function schemaView(name: string, columns?: Record<string, unknown>) {
    return new RtViewBuilder(name, requireColumns('pgSchema(...).view', name, columns), (context, viewName, builders) =>
      drizzleSchema(context).view(viewName, builders)
    ) as never;
  }
  function schemaMaterializedView(name: string, columns?: Record<string, unknown>) {
    return new RtViewBuilder(
      name,
      requireColumns('pgSchema(...).materializedView', name, columns),
      (context, viewName, builders) => drizzleSchema(context).materializedView(viewName, builders)
    ) as never;
  }
  function schemaSequence(name: string, options?: PgSequenceOptions): PgSequence {
    const sequence = new RtValueRecorder('sequence', options === undefined ? [name] : [name, options], schema);
    return {seqName: name, [rtValueKey]: sequence} as PgSequence;
  }

  return {
    schemaName,
    table: schemaTable as typeof pgTable,
    enum: schemaEnum as unknown as PgSchema<TSchemaName>['enum'],
    sequence: schemaSequence,
    view: schemaView as PgSchema<TSchemaName>['view'],
    materializedView: schemaMaterializedView as PgSchema<TSchemaName>['materializedView'],
    [rtValueKey]: schema,
  } as PgSchema<TSchemaName>;
}

// One slim table per reflected type id, so repeated calls share one materialized drizzle table.
const fromTypeTables = new Map<string, object>();

/** Runtime twin of a hand-written table, typed as the table type itself, so toDrizzle, the models and
 *  refineTableType treat it exactly like a pgTable() result. The type argument is resolved by the build
 *  (@mionjs/devtools must be active). References need the referenced tables in options.tables, runtime-callback
 *  markers take theirs from options.runtime. A call WITH options is not memoized: two tables of the same type can
 *  carry different callbacks or referenced tables. */
export function tableFromType<T extends AnyPgTable>(options?: TableFromTypeOptions<T>, id?: InjectRunTypeId<T>): T {
  const runType = getRunType<T>(undefined, id);
  if (options !== undefined) return buildRtTableFromGraph(runType as ReflectedNode, pgBuildTable, options, 'pg') as T;
  let slimTable = fromTypeTables.get(runType.id);
  if (slimTable === undefined) {
    slimTable = buildRtTableFromGraph(runType as ReflectedNode, pgBuildTable, undefined, 'pg');
    fromTypeTables.set(runType.id, slimTable);
  }
  return slimTable as T;
}
