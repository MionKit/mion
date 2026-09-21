/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The pg view factories, MANUAL-COLUMN form only: explicit columns, then `.as(sql`...`)` or
// `.existing()`. Nothing here imports drizzle; each view stores a buildView closure that receives
// the injected context at materialization (./drizzle.ts). `pgView(name)` with no columns, drizzle's
// query-builder form, is declared but NOT supported: its columns come from drizzle's select typing,
// the exact generic chain the slim design removes. It returns a named marker type so the mistake
// reads as an error on `.as(...)` rather than an arity complaint (packages/drizzle-orm/CLAUDE.md).

import type {AnyRtColumn, DrizzleContext, RtSql, RtViewBrand, RtViewMeta} from '@mionjs/drizzle-orm';
import {RtViewBuilder} from '@mionjs/drizzle-orm';

/** A pg slim view: tagged with the dialect that recorded it, so it cannot reach another dialect's toDrizzle. */
export interface PgSlimView<TName extends string, Cols> extends RtViewMeta<TName, Cols>, RtViewBrand<'pg'> {}
/** The stand-in a columnless `pgView(name)` returns: no `as`, so the query-builder form fails naming itself. */
export interface ViewFromQueryBuilderNotSupported {
  readonly __use_drizzles_pgView_for_query_builder_views: never;
}

/** Storage parameters accepted by a view's `.with(...)`. */
export type PgViewWithConfig = Record<string, unknown>;

/** Shared by both pg view builders: drizzle's DefaultViewBuilderCore. */
export interface PgViewBuilderCore<Self> {
  with(config: PgViewWithConfig): Self;
}

export interface PgViewBuilder<TName extends string, Cols extends Record<string, AnyRtColumn>> extends PgViewBuilderCore<
  PgViewBuilder<TName, Cols>
> {
  /** The view's query, as literal sql. */
  as(query: RtSql): PgSlimView<TName, Cols>;
  /** The view already exists: drizzle-kit emits no CREATE VIEW for it. */
  existing(): PgSlimView<TName, Cols>;
}

export interface PgMaterializedViewBuilder<
  TName extends string,
  Cols extends Record<string, AnyRtColumn>,
> extends PgViewBuilderCore<PgMaterializedViewBuilder<TName, Cols>> {
  using(method: string): PgMaterializedViewBuilder<TName, Cols>;
  tablespace(tablespace: string): PgMaterializedViewBuilder<TName, Cols>;
  withNoData(): PgMaterializedViewBuilder<TName, Cols>;
  as(query: RtSql): PgSlimView<TName, Cols>;
  existing(): PgSlimView<TName, Cols>;
}

export function pgBuildView(context: DrizzleContext, name: string, builders: Record<string, unknown>): unknown {
  return context.ns.pgView(name as never, builders as never);
}
export function pgBuildMaterializedView(context: DrizzleContext, name: string, builders: Record<string, unknown>): unknown {
  return context.ns.pgMaterializedView(name as never, builders as never);
}

/** Returns the SLIM view, not drizzle's own: materialize it with toDrizzle() from the './drizzle' subpath. */
export function pgView<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: Cols
): PgViewBuilder<TName, Cols>;
export function pgView(name: string): ViewFromQueryBuilderNotSupported;
export function pgView(name: string, columns?: Record<string, unknown>) {
  return new RtViewBuilder(name, requireColumns('pgView', name, columns), pgBuildView) as never;
}

export function pgMaterializedView<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: Cols
): PgMaterializedViewBuilder<TName, Cols>;
export function pgMaterializedView(name: string): ViewFromQueryBuilderNotSupported;
export function pgMaterializedView(name: string, columns?: Record<string, unknown>) {
  return new RtViewBuilder(name, requireColumns('pgMaterializedView', name, columns), pgBuildMaterializedView) as never;
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
