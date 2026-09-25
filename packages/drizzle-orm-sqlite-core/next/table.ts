/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// drizzle's sqliteTable call shape on the shipped runtime; the type holds shared nameless columns plus a names map.

import type {AnyRtColumn, RtExtraColumn} from '../../drizzle-orm/src/recorder.ts';
import type {RtTableBrand} from '../../drizzle-orm/src/table.ts';
import {createRtTable} from '../../drizzle-orm/src/table.ts';
import type {AnyColumn} from '../../drizzle-orm/next/columns.ts';
import type {NoNames, RtTableMeta} from '../../drizzle-orm/next/table.ts';
import {sqliteColumnHelpers, type SqliteColumnHelpers} from './columns.ts';
import type {rtColNameKey, rtNamedColumnKey} from '../../drizzle-orm/next/columns.ts';
import {sqliteBuildTable, sqliteTableCreator as shippedSqliteTableCreator, type SqliteExtraConfigEntry} from '../src/table.ts';
import type {InjectRunTypeId} from '@mionjs/run-types';
import {getRunType} from '@mionjs/run-types';
import type {ReflectedNode} from '../../drizzle-orm/src/fromType.ts';
import {buildRtTableFromGraph, type TableFromTypeOptions} from '../../drizzle-orm/next/fromType.ts';

/** A sqlite table: ONE type for a sqliteTable() result and a hand-written `SqliteTable<'users', {...}>`. */
export interface SqliteTable<TName extends string, Cols, Extras extends readonly object[] = [], Names = NoNames>
  extends RtTableMeta<TName, Cols, Extras, Names>, RtTableBrand<'sqlite'> {}
export type AnySqliteTable = SqliteTable<string, Record<string, AnyColumn>, readonly object[], object>;

// Maps are inline, never an alias: the resolver serializes an alias's type arguments, the builders' results.
/** A builders record's columns: each named result unwrapped to its column. */
export type LiftCols<Cols> = {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]};
type NameOf<C> = C extends {readonly [rtColNameKey]: infer Name} ? Name : undefined;

/** The extraConfig view: index decorators, and the shipped column brand the shipped helpers take. */
export type SqliteExtraConfigColumns<Cols> = {[K in keyof Cols]: Cols[K] & RtExtraColumn & AnyRtColumn};
export type SqliteExtraConfigFn<Cols> = (
  self: SqliteExtraConfigColumns<Cols>
) => readonly SqliteExtraConfigEntry[] | Record<string, SqliteExtraConfigEntry>;

type ColumnsArg<Cols> = Cols | ((helpers: SqliteColumnHelpers) => Cols);

function resolveColumns<Cols>(columns: ColumnsArg<Cols>): Cols {
  return typeof columns === 'function' ? (columns as (helpers: SqliteColumnHelpers) => Cols)(sqliteColumnHelpers) : columns;
}

export function sqliteTable<TName extends string, Cols extends Record<string, object>>(
  name: TName,
  columns: Cols,
  extraConfig?: SqliteExtraConfigFn<LiftCols<Cols>>
): SqliteTable<
  TName,
  {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
  [],
  {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
>;
export function sqliteTable<TName extends string, Cols extends Record<string, object>>(
  name: TName,
  columns: (helpers: SqliteColumnHelpers) => Cols,
  extraConfig?: SqliteExtraConfigFn<LiftCols<Cols>>
): SqliteTable<
  TName,
  {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
  [],
  {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
>;
export function sqliteTable(name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) {
  return createRtTable(name, resolveColumns(columns), extraConfig as never, sqliteBuildTable);
}

/** What sqliteTableCreator returns: sqliteTable's call shape, named so declaration emit can print it. */
export interface SqliteTableCreatorFn {
  <TName extends string, Cols extends Record<string, object>>(
    name: TName,
    columns: Cols,
    extraConfig?: SqliteExtraConfigFn<LiftCols<Cols>>
  ): SqliteTable<
    TName,
    {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
    [],
    {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
  >;
  <TName extends string, Cols extends Record<string, object>>(
    name: TName,
    columns: (helpers: SqliteColumnHelpers) => Cols,
    extraConfig?: SqliteExtraConfigFn<LiftCols<Cols>>
  ): SqliteTable<
    TName,
    {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
    [],
    {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
  >;
}

/** Drizzle's sqliteTableCreator: a sqliteTable with a table-name mapper, recorded by the shipped creator. */
export function sqliteTableCreator(customizeTableName: (name: string) => string): SqliteTableCreatorFn {
  const shippedCreate = shippedSqliteTableCreator(customizeTableName) as unknown as (...args: unknown[]) => unknown;
  // Resolved here: the shipped creator would hand a columns callback the shipped helpers.
  return ((name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) =>
    shippedCreate(name, resolveColumns(columns), extraConfig)) as SqliteTableCreatorFn;
}

// One slim table per reflected type id, so repeated calls share one materialized drizzle table.
const fromTypeTables = new Map<string, object>();

/** Runtime twin of a hand-written table, typed as the table type itself. A call with options is not memoized. */
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
