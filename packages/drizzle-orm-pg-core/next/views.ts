/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Side-by-side pg views, manual-column form only, over the shipped view recorder.

import type {RtSql} from '../../drizzle-orm/src/recorder.ts';
import type {RtViewBrand} from '../../drizzle-orm/src/view.ts';
import {RtViewBuilder} from '../../drizzle-orm/src/view.ts';
import type {AnyColumn} from '../../drizzle-orm/next/columns.ts';
import type {NoNames, RtViewMeta} from '../../drizzle-orm/next/table.ts';
import {pgBuildMaterializedView, pgBuildView, requireColumns, type ViewFromQueryBuilderNotSupported} from '../src/views.ts';
import type {rtColNameKey, rtNamedColumnKey} from '../../drizzle-orm/next/columns.ts';

// Inline maps, never aliases over the builders record: see pgTable in ./table.ts.
type NameOf<C> = C extends {readonly [rtColNameKey]: infer Name} ? Name : undefined;

export interface PgView<TName extends string, Cols, Names = NoNames> extends RtViewMeta<TName, Cols, Names>, RtViewBrand<'pg'> {}
export type AnyPgView = PgView<string, Record<string, AnyColumn>, object>;

export interface PgViewBuilder<TName extends string, Cols, Names> {
  with(config: Record<string, unknown>): PgViewBuilder<TName, Cols, Names>;
  as(query: RtSql): PgView<TName, Cols, Names>;
  existing(): PgView<TName, Cols, Names>;
}
export interface PgMaterializedViewBuilder<TName extends string, Cols, Names> {
  with(config: Record<string, unknown>): PgMaterializedViewBuilder<TName, Cols, Names>;
  using(method: string): PgMaterializedViewBuilder<TName, Cols, Names>;
  tablespace(tablespace: string): PgMaterializedViewBuilder<TName, Cols, Names>;
  withNoData(): PgMaterializedViewBuilder<TName, Cols, Names>;
  as(query: RtSql): PgView<TName, Cols, Names>;
  existing(): PgView<TName, Cols, Names>;
}

export function pgView<TName extends string, Cols extends Record<string, object>>(
  name: TName,
  columns: Cols
): PgViewBuilder<
  TName,
  {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
  {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
>;
export function pgView(name: string): ViewFromQueryBuilderNotSupported;
export function pgView(name: string, columns?: Record<string, unknown>) {
  return new RtViewBuilder(name, requireColumns('pgView', name, columns), pgBuildView) as never;
}
export function pgMaterializedView<TName extends string, Cols extends Record<string, object>>(
  name: TName,
  columns: Cols
): PgMaterializedViewBuilder<
  TName,
  {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
  {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
>;
export function pgMaterializedView(name: string): ViewFromQueryBuilderNotSupported;
export function pgMaterializedView(name: string, columns?: Record<string, unknown>) {
  return new RtViewBuilder(name, requireColumns('pgMaterializedView', name, columns), pgBuildMaterializedView) as never;
}
