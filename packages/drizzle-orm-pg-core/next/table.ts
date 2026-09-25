/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Side-by-side pg table: the same call shape as drizzle's pgTable, the shipped runtime, and a type
// that holds the shared nameless columns plus a names map for the db names that differ from the key.

import type {AnyRtColumn, RtExtraColumn} from '../../drizzle-orm/src/recorder.ts';
import type {RtTableBrand} from '../../drizzle-orm/src/table.ts';
import {createRtTable} from '../../drizzle-orm/src/table.ts';
import type {AnyColumn} from '../../drizzle-orm/next/columns.ts';
import type {LiftNames, NoNames, RtTableMeta} from '../../drizzle-orm/next/table.ts';
import {pgColumnHelpers, type PgColumnHelpers} from './columns.ts';
import type {rtBuiltColumnKey} from './columns.ts';
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

/** The columns a builder table holds: each builder's Column, its db name moved into the names map. */
export type LiftCols<Cols> = {[K in keyof Cols]: Cols[K][typeof rtBuiltColumnKey & keyof Cols[K]]};
/** Any builder, the constraint of a builder columns record. */
export type AnyColumnBuilder = {readonly [rtBuiltColumnKey]: AnyColumn};

/** The extraConfig view: index decorators, and the shipped column brand the shipped helpers take. */
export type PgExtraConfigColumns<Cols> = {[K in keyof Cols]: Cols[K] & RtExtraColumn & AnyRtColumn};
export type PgExtraConfigFn<Cols> = (
  self: PgExtraConfigColumns<Cols>
) => readonly PgExtraConfigEntry[] | Record<string, PgExtraConfigEntry>;

type ColumnsArg<Cols> = Cols | ((helpers: PgColumnHelpers) => Cols);

/** What pgTable returns: one alias, so a declaration file prints the builders record once. */
export type PgBuilderTable<TName extends string, Cols> = PgTable<TName, LiftCols<Cols>, [], LiftNames<Cols>>;

export function pgTable<TName extends string, Cols extends Record<string, AnyColumnBuilder>>(
  name: TName,
  columns: Cols,
  extraConfig?: PgExtraConfigFn<LiftCols<Cols>>
): PgBuilderTable<TName, Cols>;
export function pgTable<TName extends string, Cols extends Record<string, AnyColumnBuilder>>(
  name: TName,
  columns: (helpers: PgColumnHelpers) => Cols,
  extraConfig?: PgExtraConfigFn<LiftCols<Cols>>
): PgBuilderTable<TName, Cols>;
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
