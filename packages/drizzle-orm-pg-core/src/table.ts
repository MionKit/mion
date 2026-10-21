/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// drizzle's table call shapes, slim recorder returns. Shared nameless columns plus a names map make a pgTable()
// result and a hand-written `PgTable<'users', {...}>` one type. No drizzle import: ./drizzle.ts injects the context.

import type {
  DrizzleContext,
  EntryColRefs,
  LiftCols,
  NameOf,
  NoNames,
  ReflectedNode,
  RtExtraColumn,
  RtTableBrand,
  RtTableInfer,
  RtTableMeta,
  TableEntry,
  TableFromTypeOptions,
  rtNamedColumnKey,
} from '@mionjs/drizzle-orm';
import {createRtTable, rtTableFromRunType, RtValueRecorder, RtViewBuilder, rtValueKey} from '@mionjs/drizzle-orm';
import type {InjectRunTypeId} from '@mionjs/run-types';
import {getRunType} from '@mionjs/run-types';
import {pgColumnHelpers, type PgColumnHelpers} from './columns.ts';
import {makeEnumFactory, type pgEnum} from './helpers.ts';
import {requireColumns, type pgMaterializedView, type pgView} from './views.ts';
import type {AnyPgTable} from './types.ts';

/** A pg table: ONE type for a pgTable() result and a hand-written `PgTable<'users', {...}>`. */
export interface PgTable<Name extends string, Cols, Extras extends readonly object[] = [], Names = NoNames>
  extends RtTableMeta<Name, Cols, Extras, Names>, RtTableBrand<'pg'>, RtTableInfer<Cols> {
  enableRLS(): PgTableWithRLS<Name, Cols, Extras, Names>;
}
/** A pg table with row level security on: the same table minus enableRLS, as drizzle's own `Omit<..., 'enableRLS'>`. */
export interface PgTableWithRLS<Name extends string, Cols, Extras extends readonly object[] = [], Names = NoNames>
  extends RtTableMeta<Name, Cols, Extras, Names>, RtTableBrand<'pg'>, RtTableInfer<Cols> {}
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
/** `foreignKey(...)`: own columns by record key, foreign ones by table db name + key, resolved through options.tables. */
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

/** The extraConfig view of the table's columns: plus the index-position decorators (asc/desc/op). */
export type PgExtraConfigColumns<Cols> = {[K in keyof Cols]: Cols[K] & RtExtraColumn};
// `object`, not a union with PgEntryBrand: that brand is a weak type and would reject a real drizzle entry.
/** ONE extraConfig entry: ours, a REAL drizzle one (crudPolicy, supabase roles), or a group flattened one level. */
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

// Maps are inline, never an alias: the resolver serializes an alias's type arguments, the builders' results.
/** Records the table and returns the SLIM table, not drizzle's own: toDrizzle() from the ./drizzle subpath builds that. */
export function pgTable<Name extends string, Cols extends Record<string, object>>(
  name: Name,
  columns: Cols,
  extraConfig?: PgExtraConfigFn<LiftCols<Cols>>
): PgTable<
  Name,
  {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
  [],
  {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
>;
export function pgTable<Name extends string, Cols extends Record<string, object>>(
  name: Name,
  columns: (helpers: PgColumnHelpers) => Cols,
  extraConfig?: PgExtraConfigFn<LiftCols<Cols>>
): PgTable<
  Name,
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

export interface PgSchema<SchemaName extends string = string> {
  readonly schemaName: SchemaName;
  table: typeof pgTable;
  view: typeof pgView;
  materializedView: typeof pgMaterializedView;
  enum: typeof pgEnum;
  sequence(name: string, options?: PgSequenceOptions): PgSequence;
}

export function pgSchema<SchemaName extends string>(schemaName: SchemaName): PgSchema<SchemaName> {
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
    enum: schemaEnum as unknown as PgSchema<SchemaName>['enum'],
    sequence: schemaSequence,
    view: schemaView as PgSchema<SchemaName>['view'],
    materializedView: schemaMaterializedView as PgSchema<SchemaName>['materializedView'],
    [rtValueKey]: schema,
  } as PgSchema<SchemaName>;
}

// Needs @mionjs/devtools; references read options.tables, runtime-callback markers options.runtime.
/** Runtime twin of a hand-written table type; a call WITH options is not memoized, its callbacks or tables may differ. */
export function tableFromType<T extends AnyPgTable>(options?: TableFromTypeOptions<T>, id?: InjectRunTypeId<T>): T {
  return rtTableFromRunType(getRunType<T>(undefined, id) as ReflectedNode, pgBuildTable, 'pg', options) as T;
}
