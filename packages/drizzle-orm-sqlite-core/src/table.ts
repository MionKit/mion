/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The sqlite table factories: drizzle-identical call shapes, slim recorder
// returns. Nothing here imports drizzle; the buildTable closures receive the
// injected context at materialization (toDrizzle, in ./drizzle.ts).

import type {AnyRtColumn, DrizzleContext, RtExtraColumn, RtTable} from '@mionjs/drizzle-orm';
import {createRtTable, RtValueRecorder} from '@mionjs/drizzle-orm';
import {sqliteColumnHelpers, type SQLiteColumnHelpers} from './columns.ts';
import type {SqliteEntryBrand} from './helpers.ts';

/** The extraConfig view of the table's columns. */
export type SqliteExtraConfigColumns<Cols> = {[K in keyof Cols]: Cols[K] & RtExtraColumn};
export type SqliteExtraConfigFn<Cols> = (self: SqliteExtraConfigColumns<Cols>) => readonly SqliteEntryBrand[];

type ColumnsArg<Cols> = Cols | ((helpers: SQLiteColumnHelpers) => Cols);

function resolveColumns<Cols>(columns: ColumnsArg<Cols>): Cols {
  return typeof columns === 'function' ? (columns as (helpers: SQLiteColumnHelpers) => Cols)(sqliteColumnHelpers) : columns;
}

function sqliteBuildTable(
  context: DrizzleContext,
  name: string,
  builders: Record<string, unknown>,
  extraReplay?: (dzExtraColumns: Record<string, unknown>) => unknown[]
): unknown {
  return extraReplay
    ? context.ns.sqliteTable(name as never, builders as never, extraReplay as never)
    : context.ns.sqliteTable(name as never, builders as never);
}

export function sqliteTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: Cols,
  extraConfig?: SqliteExtraConfigFn<Cols>
): RtTable<TName, Cols>;
export function sqliteTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: (helpers: SQLiteColumnHelpers) => Cols,
  extraConfig?: SqliteExtraConfigFn<Cols>
): RtTable<TName, Cols>;
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
  ): RtTable<TName, Cols>;
  function createTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
    name: TName,
    columns: (helpers: SQLiteColumnHelpers) => Cols,
    extraConfig?: SqliteExtraConfigFn<Cols>
  ): RtTable<TName, Cols>;
  function createTable(name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) {
    return createRtTable(name, resolveColumns(columns), extraConfig as never, (context, tableName, builders, extraReplay) => {
      const drizzleCreator = creator.toDrizzleValue(context) as (...a: unknown[]) => unknown;
      return extraReplay ? drizzleCreator(tableName, builders, extraReplay) : drizzleCreator(tableName, builders);
    });
  }
  return createTable;
}
