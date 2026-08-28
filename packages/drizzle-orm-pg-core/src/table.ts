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

import type {AnyRtColType, AnyRtColumn, AnyRtTable, DrizzleContext, ReflectedNode, RtExtraColumn, RtTable, TypedCols} from '@mionjs/drizzle-orm';
import {buildRtTableFromGraph, createRtTable, RtColumnRecorder, RtValueRecorder, rtValueKey} from '@mionjs/drizzle-orm';
import type {RunType} from '@ts-runtypes/core';
import {pgColumnHelpers, type PgColumnHelpers} from './columns.ts';
import type {PgEntryBrand} from './helpers.ts';

/** Pure-type twin of `pgTable(name, columns)`: a table declared entirely as a
 *  type, from the column types (Varchar, Uuid, ...) and modifier markers
 *  (NotNull, PrimaryKey, ...). Normalizes to the same RtTable shape the
 *  builders produce, so models and refinement work unchanged; materialize it
 *  with tableFromType on the './drizzle' subpath. */
export type PgTable<TName extends string, Cols extends Record<string, AnyRtColType>> = RtTable<TName, TypedCols<Cols>>;

// Rebuilt slim tables, one per reflected table id, so repeated calls share one
// slim table and therefore one materialized drizzle table.
const fromTypeTables = new Map<string, object>();

/** Runtime twin of a TYPE-defined table: rebuild the slim table from the
 *  reflected graph, typed as the table type itself — so toDrizzle, the models
 *  and refineTableType treat it exactly like a pgTable() result. Resolve the
 *  graph at the call site: `tableFromType(getRunType<UsersTable>())`. */
export function tableFromType<T extends AnyRtTable>(runType: RunType<T>): T {
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

export type PgExtraConfigFn<Cols> = (self: PgExtraConfigColumns<Cols>) => readonly PgEntryBrand[];

type ColumnsArg<Cols> = Cols | ((helpers: PgColumnHelpers) => Cols);

function resolveColumns<Cols>(columns: ColumnsArg<Cols>): Cols {
  return typeof columns === 'function' ? (columns as (helpers: PgColumnHelpers) => Cols)(pgColumnHelpers) : columns;
}

/** The pg buildTable closure (also used by tableFromType in ./drizzle.ts). */
export function pgBuildTable(
  context: DrizzleContext,
  name: string,
  builders: Record<string, unknown>,
  extraReplay?: (dzExtraColumns: Record<string, unknown>) => unknown[]
): unknown {
  return extraReplay
    ? context.ns.pgTable(name as never, builders as never, extraReplay as never)
    : context.ns.pgTable(name as never, builders as never);
}

/** Records the table; returns a slim RtTable, NOT drizzle's PgTable. The real
 *  drizzle table is built on demand by toDrizzle() from the ./drizzle subpath. */
export function pgTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: Cols,
  extraConfig?: PgExtraConfigFn<Cols>
): RtTable<TName, Cols>;
export function pgTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: (helpers: PgColumnHelpers) => Cols,
  extraConfig?: PgExtraConfigFn<Cols>
): RtTable<TName, Cols>;
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
  ): RtTable<TName, Cols>;
  function createTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
    name: TName,
    columns: (helpers: PgColumnHelpers) => Cols,
    extraConfig?: PgExtraConfigFn<Cols>
  ): RtTable<TName, Cols>;
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

  function schemaSequence(name: string, options?: PgSequenceOptions): PgSequence {
    const sequence = new RtValueRecorder('sequence', options === undefined ? [name] : [name, options], schema);
    return {seqName: name, [rtValueKey]: sequence} as PgSequence;
  }

  return {
    schemaName,
    table: schemaTable as typeof pgTable,
    enum: schemaEnum as PgSchema<TSchemaName>['enum'],
    sequence: schemaSequence,
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
