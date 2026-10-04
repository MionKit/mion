/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// MANUAL-COLUMN views only. `pgView(name)` with no columns (the query-builder form) is NOT supported: its columns come
// from drizzle's select typing, so it returns a marker type that errors on `.as(...)` (packages/drizzle-orm/AGENTS.md).

import type {
  DrizzleContext,
  NameOf,
  NoNames,
  RtSql,
  RtViewBrand,
  RtViewInfer,
  RtViewMeta,
  rtNamedColumnKey,
} from '@mionjs/drizzle-orm';
import {RtViewBuilder} from '@mionjs/drizzle-orm';

/** The stand-in a columnless `pgView(name)` returns: no `as`, so the query-builder form fails naming itself. */
export interface ViewFromQueryBuilderNotSupported {
  readonly __use_drizzles_pgView_for_query_builder_views: never;
}

function pgBuildView(context: DrizzleContext, name: string, builders: Record<string, unknown>): unknown {
  return context.ns.pgView(name as never, builders as never);
}
function pgBuildMaterializedView(context: DrizzleContext, name: string, builders: Record<string, unknown>): unknown {
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

export interface PgView<Name extends string, Cols, Names = NoNames>
  extends RtViewMeta<Name, Cols, Names>, RtViewBrand<'pg'>, RtViewInfer<Cols> {}
export interface PgViewBuilder<Name extends string, Cols, Names> {
  with(config: Record<string, unknown>): PgViewBuilder<Name, Cols, Names>;
  as(query: RtSql): PgView<Name, Cols, Names>;
  existing(): PgView<Name, Cols, Names>;
}
export interface PgMaterializedViewBuilder<Name extends string, Cols, Names> {
  with(config: Record<string, unknown>): PgMaterializedViewBuilder<Name, Cols, Names>;
  using(method: string): PgMaterializedViewBuilder<Name, Cols, Names>;
  tablespace(tablespace: string): PgMaterializedViewBuilder<Name, Cols, Names>;
  withNoData(): PgMaterializedViewBuilder<Name, Cols, Names>;
  as(query: RtSql): PgView<Name, Cols, Names>;
  existing(): PgView<Name, Cols, Names>;
}

// Inline maps, never aliases over the builders record: see pgTable in ./table.ts.
export function pgView<Name extends string, Cols extends Record<string, object>>(
  name: Name,
  columns: Cols
): PgViewBuilder<
  Name,
  {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
  {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
>;
export function pgView(name: string): ViewFromQueryBuilderNotSupported;
export function pgView(name: string, columns?: Record<string, unknown>) {
  return new RtViewBuilder(name, requireColumns('pgView', name, columns), pgBuildView) as never;
}
export function pgMaterializedView<Name extends string, Cols extends Record<string, object>>(
  name: Name,
  columns: Cols
): PgMaterializedViewBuilder<
  Name,
  {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
  {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
>;
export function pgMaterializedView(name: string): ViewFromQueryBuilderNotSupported;
export function pgMaterializedView(name: string, columns?: Record<string, unknown>) {
  return new RtViewBuilder(name, requireColumns('pgMaterializedView', name, columns), pgBuildMaterializedView) as never;
}
