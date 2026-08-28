/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The mysql table factories: drizzle-identical call shapes, slim recorder
// returns. Nothing here imports drizzle; the buildTable closures receive the
// injected context at materialization (toDrizzle, in ./drizzle.ts).

import type {AnyRtColumn, DrizzleContext, RtExtraColumn, RtTable} from '@mionjs/drizzle-orm';
import {createRtTable, RtValueRecorder, rtValueKey} from '@mionjs/drizzle-orm';
import {mysqlColumnHelpers, type MySqlColumnHelpers} from './columns.ts';
import type {MyEntryBrand} from './helpers.ts';

/** The extraConfig view of the table's columns. */
export type MyExtraConfigColumns<Cols> = {[K in keyof Cols]: Cols[K] & RtExtraColumn};
export type MyExtraConfigFn<Cols> = (self: MyExtraConfigColumns<Cols>) => readonly MyEntryBrand[];

type ColumnsArg<Cols> = Cols | ((helpers: MySqlColumnHelpers) => Cols);

function resolveColumns<Cols>(columns: ColumnsArg<Cols>): Cols {
  return typeof columns === 'function' ? (columns as (helpers: MySqlColumnHelpers) => Cols)(mysqlColumnHelpers) : columns;
}

function myBuildTable(
  context: DrizzleContext,
  name: string,
  builders: Record<string, unknown>,
  extraReplay?: (dzExtraColumns: Record<string, unknown>) => unknown[]
): unknown {
  return extraReplay
    ? context.ns.mysqlTable(name as never, builders as never, extraReplay as never)
    : context.ns.mysqlTable(name as never, builders as never);
}

export function mysqlTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: Cols,
  extraConfig?: MyExtraConfigFn<Cols>
): RtTable<TName, Cols>;
export function mysqlTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: (helpers: MySqlColumnHelpers) => Cols,
  extraConfig?: MyExtraConfigFn<Cols>
): RtTable<TName, Cols>;
export function mysqlTable(name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) {
  return createRtTable(name, resolveColumns(columns), extraConfig as never, myBuildTable);
}

/** Drizzle's mysqlTableCreator: a mysqlTable with a table-name mapper, recorded. */
export function mysqlTableCreator(customizeTableName: (name: string) => string) {
  const creator = new RtValueRecorder('mysqlTableCreator', [customizeTableName]);
  function createTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
    name: TName,
    columns: Cols,
    extraConfig?: MyExtraConfigFn<Cols>
  ): RtTable<TName, Cols>;
  function createTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
    name: TName,
    columns: (helpers: MySqlColumnHelpers) => Cols,
    extraConfig?: MyExtraConfigFn<Cols>
  ): RtTable<TName, Cols>;
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
}

export function mysqlSchema<TSchemaName extends string>(schemaName: TSchemaName): MySqlSchema<TSchemaName> {
  const schema = new RtValueRecorder('mysqlSchema', [schemaName]);
  function schemaTable(name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) {
    return createRtTable(name, resolveColumns(columns), extraConfig as never, (context, tableName, builders, extraReplay) => {
      const drizzleSchema = schema.toDrizzleValue(context) as {table: (...a: unknown[]) => unknown};
      return extraReplay ? drizzleSchema.table(tableName, builders, extraReplay) : drizzleSchema.table(tableName, builders);
    });
  }
  return {schemaName, table: schemaTable as typeof mysqlTable, [rtValueKey]: schema} as MySqlSchema<TSchemaName>;
}
