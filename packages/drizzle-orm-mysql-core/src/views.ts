/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The mysql view factory, MANUAL-COLUMN form only: explicit columns, then `.as(sql`...`)` or
// `.existing()`. Nothing here imports drizzle; the buildView closure receives the injected context
// at materialization (./drizzle.ts). `mysqlView(name)` with no columns, drizzle's query-builder
// form, is declared but NOT supported: its columns come from drizzle's select typing, the exact
// generic chain the slim design removes (packages/drizzle-orm/CLAUDE.md).

import type {AnyRtColumn, DrizzleContext, RtSql, RtViewBrand, RtViewMeta} from '@mionjs/drizzle-orm';
import {RtViewBuilder} from '@mionjs/drizzle-orm';

/** A mysql slim view: tagged with the dialect that recorded it, so it cannot reach another dialect's toDrizzle. */
export interface MysqlSlimView<TName extends string, Cols> extends RtViewMeta<TName, Cols>, RtViewBrand<'mysql'> {}
/** The stand-in a columnless `mysqlView(name)` returns: no `as`, so the query-builder form fails naming itself. */
export interface ViewFromQueryBuilderNotSupported {
  readonly __use_drizzles_mysqlView_for_query_builder_views: never;
}

export type MySqlViewAlgorithm = 'undefined' | 'merge' | 'temptable';
export type MySqlViewSecurity = 'definer' | 'invoker';
export type MySqlViewCheckOption = 'local' | 'cascaded';

export interface MySqlViewBuilder<TName extends string, Cols extends Record<string, AnyRtColumn>> {
  algorithm(algorithm: MySqlViewAlgorithm): MySqlViewBuilder<TName, Cols>;
  sqlSecurity(sqlSecurity: MySqlViewSecurity): MySqlViewBuilder<TName, Cols>;
  withCheckOption(withCheckOption?: MySqlViewCheckOption): MySqlViewBuilder<TName, Cols>;
  /** The view's query, as literal sql. */
  as(query: RtSql): MysqlSlimView<TName, Cols>;
  /** The view already exists: drizzle-kit emits no CREATE VIEW for it. */
  existing(): MysqlSlimView<TName, Cols>;
}

export function mysqlBuildView(context: DrizzleContext, name: string, builders: Record<string, unknown>): unknown {
  return context.ns.mysqlView(name as never, builders as never);
}

export function mysqlView<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: Cols
): MySqlViewBuilder<TName, Cols>;
export function mysqlView(name: string): ViewFromQueryBuilderNotSupported;
export function mysqlView(name: string, columns?: Record<string, unknown>) {
  return new RtViewBuilder(name, requireColumns('mysqlView', name, columns), mysqlBuildView) as never;
}

/** The runtime half of the unsupported query-builder form: typed code cannot reach it, plain JS can. */
export function requireColumns(fn: string, name: string, columns: Record<string, unknown> | undefined): Record<string, unknown> {
  if (columns !== undefined) return columns;
  throw new Error(
    `@mionjs/drizzle-orm-mysql-core: ${fn}('${name}') without columns builds the view from a drizzle query builder, ` +
      'which the slim surface does not carry. Either declare the columns explicitly and use .as(sql`...`), ' +
      'or declare this view with drizzle itself over your toDrizzle() tables.'
  );
}
