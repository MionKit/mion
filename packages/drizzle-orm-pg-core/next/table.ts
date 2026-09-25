/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// drizzle's pgTable call shape on the shipped runtime; the type holds shared nameless columns plus a names map.

import type {AnyRtColumn, RtExtraColumn} from '../../drizzle-orm/src/recorder.ts';
import type {RtTableBrand} from '../../drizzle-orm/src/table.ts';
import {createRtTable} from '../../drizzle-orm/src/table.ts';
import type {AnyColumn} from '../../drizzle-orm/next/columns.ts';
import type {NoNames, RtTableMeta} from '../../drizzle-orm/next/table.ts';
import {pgColumnHelpers, type PgColumnHelpers} from './columns.ts';
import type {rtColNameKey, rtNamedColumnKey} from '../../drizzle-orm/next/columns.ts';
import {pgBuildTable, type PgExtraConfigEntry} from '../src/table.ts';
import type {InjectRunTypeId} from '@mionjs/run-types';
import {getRunType} from '@mionjs/run-types';
import type {ReflectedNode} from '../../drizzle-orm/src/fromType.ts';
import {buildRtTableFromGraph, type TableFromTypeOptions} from '../../drizzle-orm/next/fromType.ts';

/** A pg table: ONE type for a pgTable() result and a hand-written `PgTable<'users', {...}>`. */
export interface PgTable<TName extends string, Cols, Extras extends readonly object[] = [], Names = NoNames>
  extends RtTableMeta<TName, Cols, Extras, Names>, RtTableBrand<'pg'> {
  enableRLS(): PgTableWithRLS<TName, Cols, Extras, Names>;
}
/** A pg table with row level security on, minus enableRLS. */
export interface PgTableWithRLS<TName extends string, Cols, Extras extends readonly object[] = [], Names = NoNames>
  extends RtTableMeta<TName, Cols, Extras, Names>, RtTableBrand<'pg'> {}
export type AnyPgTable = PgTableWithRLS<string, Record<string, AnyColumn>, readonly object[], object>;

// Maps are inline, never an alias: the resolver serializes an alias's type arguments, the builders' results.
/** A builders record's columns: each named result unwrapped to its column. */
export type LiftCols<Cols> = {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]};
type NameOf<C> = C extends {readonly [rtColNameKey]: infer Name} ? Name : undefined;

/** The extraConfig view: index decorators, and the shipped column brand the shipped helpers take. */
export type PgExtraConfigColumns<Cols> = {[K in keyof Cols]: Cols[K] & RtExtraColumn & AnyRtColumn};
export type PgExtraConfigFn<Cols> = (
  self: PgExtraConfigColumns<Cols>
) => readonly PgExtraConfigEntry[] | Record<string, PgExtraConfigEntry>;

type ColumnsArg<Cols> = Cols | ((helpers: PgColumnHelpers) => Cols);

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
  const resolved = typeof columns === 'function' ? columns(pgColumnHelpers) : columns;
  return createRtTable(name, resolved, extraConfig as never, pgBuildTable);
}

// One slim table per reflected type id, so repeated calls share one materialized drizzle table.
const fromTypeTables = new Map<string, object>();

/** Runtime twin of a hand-written table, typed as the table type itself. A call with options is not memoized. */
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
