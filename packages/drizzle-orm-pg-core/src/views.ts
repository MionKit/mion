/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// MANUAL-COLUMN views only. `pgView(name)` with no columns (the query-builder form) is NOT supported: its columns come
// from drizzle's select typing, so it returns a marker type that errors on `.as(...)` (packages/drizzle-orm/CLAUDE.md).

import type {
  AnyColumn,
  DrizzleContext,
  NoNames,
  RtSql,
  RtViewBrand,
  RtViewMeta,
  rtColNameKey,
  rtNamedColumnKey,
} from '@mionjs/drizzle-orm';
import {RtViewBuilder} from '@mionjs/drizzle-orm';

/** The stand-in a columnless `pgView(name)` returns: no `as`, so the query-builder form fails naming itself. */
export interface ViewFromQueryBuilderNotSupported {
  readonly __use_drizzles_pgView_for_query_builder_views: never;
}

export function pgBuildView(context: DrizzleContext, name: string, builders: Record<string, unknown>): unknown {
  return context.ns.pgView(name as never, builders as never);
}
export function pgBuildMaterializedView(context: DrizzleContext, name: string, builders: Record<string, unknown>): unknown {
  return context.ns.pgMaterializedView(name as never, builders as never);
}

/** The runtime half of the unsupported query-builder form: typed code cannot reach it, plain JS can. */
export function requireColumns(fn: string, name: string, columns: Record<string, unknown> | undefined): Record<string, unknown> {
  if (columns !== undefined) return columns;
  throw new Error(
    `@mionjs/drizzle-orm-pg-core: ${fn}('${name}') without columns builds the view from a drizzle query builder, ` +
      'which the slim surface does not carry. Either declare the columns explicitly and use .as(sql`...`), ' +
      'or declare this view with drizzle itself over your toDrizzle() tables.'
  );
}

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
