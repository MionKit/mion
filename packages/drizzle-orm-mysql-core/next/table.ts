/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// drizzle's mysqlTable call shape on the shipped runtime; the type holds shared nameless columns plus a names map.

import type {AnyRtColumn, RtExtraColumn} from '../../drizzle-orm/src/recorder.ts';
import type {RtTableBrand} from '../../drizzle-orm/src/table.ts';
import {createRtTable} from '../../drizzle-orm/src/table.ts';
import type {AnyColumn} from '../../drizzle-orm/next/columns.ts';
import type {NoNames, RtTableMeta} from '../../drizzle-orm/next/table.ts';
import {mysqlColumnHelpers, type MysqlColumnHelpers} from './columns.ts';
import type {mysqlView} from './views.ts';
import type {rtColNameKey, rtNamedColumnKey} from '../../drizzle-orm/next/columns.ts';
import {
  mysqlBuildTable,
  mysqlSchema as shippedMysqlSchema,
  mysqlTableCreator as shippedMysqlTableCreator,
  type MyExtraConfigEntry,
} from '../src/table.ts';
import type {InjectRunTypeId} from '@mionjs/run-types';
import {getRunType} from '@mionjs/run-types';
import type {ReflectedNode} from '../../drizzle-orm/src/fromType.ts';
import {buildRtTableFromGraph, type TableFromTypeOptions} from '../../drizzle-orm/next/fromType.ts';

/** A mysql table: ONE type for a mysqlTable() result and a hand-written `MysqlTable<'users', {...}>`. */
export interface MysqlTable<TName extends string, Cols, Extras extends readonly object[] = [], Names = NoNames>
  extends RtTableMeta<TName, Cols, Extras, Names>, RtTableBrand<'mysql'> {}
export type AnyMysqlTable = MysqlTable<string, Record<string, AnyColumn>, readonly object[], object>;

// Maps are inline, never an alias: the resolver serializes an alias's type arguments, the builders' results.
/** A builders record's columns: each named result unwrapped to its column. */
export type LiftCols<Cols> = {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]};
type NameOf<C> = C extends {readonly [rtColNameKey]: infer Name} ? Name : undefined;

/** The extraConfig view: index decorators, and the shipped column brand the shipped helpers take. */
export type MysqlExtraConfigColumns<Cols> = {[K in keyof Cols]: Cols[K] & RtExtraColumn & AnyRtColumn};
export type MysqlExtraConfigFn<Cols> = (
  self: MysqlExtraConfigColumns<Cols>
) => readonly MyExtraConfigEntry[] | Record<string, MyExtraConfigEntry>;

type ColumnsArg<Cols> = Cols | ((helpers: MysqlColumnHelpers) => Cols);

function resolveColumns(columns: ColumnsArg<Record<string, unknown>>): Record<string, unknown> {
  return typeof columns === 'function' ? columns(mysqlColumnHelpers) : columns;
}

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

/** Drizzle's mysqlTableCreator over the new columns: the shipped recorder, handed resolved columns. */
export function mysqlTableCreator(customizeTableName: (name: string) => string): typeof mysqlTable {
  const createTable = shippedMysqlTableCreator(customizeTableName);
  return ((name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) =>
    createTable(name, resolveColumns(columns) as never, extraConfig as never) as never) as typeof mysqlTable;
}

export interface MySqlSchema<TSchemaName extends string = string> {
  readonly schemaName: TSchemaName;
  table: typeof mysqlTable;
  view: typeof mysqlView;
}

/** Drizzle's mysqlSchema over the new columns: the shipped handle, so toDrizzle(schema) still materializes it. */
export function mysqlSchema<TSchemaName extends string>(schemaName: TSchemaName): MySqlSchema<TSchemaName> {
  const shipped = shippedMysqlSchema(schemaName);
  const table = (name: string, columns: ColumnsArg<Record<string, unknown>>, extraConfig?: unknown) =>
    shipped.table(name, resolveColumns(columns) as never, extraConfig as never);
  // The spread keeps the shipped handle's symbol-keyed recorder.
  return {...shipped, table} as unknown as MySqlSchema<TSchemaName>;
}

// One slim table per reflected type id, so repeated calls share one materialized drizzle table.
const fromTypeTables = new Map<string, object>();

/** Runtime twin of a hand-written table, typed as the table type itself. A call with options is not memoized. */
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
