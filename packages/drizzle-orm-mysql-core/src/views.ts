/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// MANUAL-COLUMN views only. `mysqlView(name)` with no columns (the query-builder form) is NOT supported: its columns
// come from drizzle's select typing (packages/drizzle-orm/AGENTS.md).

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

export interface ViewFromQueryBuilderNotSupported {
  readonly __use_drizzles_mysqlView_for_query_builder_views: never;
}

export type MySqlViewAlgorithm = 'undefined' | 'merge' | 'temptable';
export type MySqlViewSecurity = 'definer' | 'invoker';
export type MySqlViewCheckOption = 'local' | 'cascaded';

function mysqlBuildView(context: DrizzleContext, name: string, builders: Record<string, unknown>): unknown {
  return context.ns.mysqlView(name as never, builders as never);
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

export interface MysqlView<Name extends string, Cols, Names = NoNames>
  extends RtViewMeta<Name, Cols, Names>, RtViewBrand<'mysql'>, RtViewInfer<Cols> {}
export interface MysqlViewBuilder<Name extends string, Cols, Names> {
  algorithm(algorithm: MySqlViewAlgorithm): MysqlViewBuilder<Name, Cols, Names>;
  sqlSecurity(sqlSecurity: MySqlViewSecurity): MysqlViewBuilder<Name, Cols, Names>;
  withCheckOption(withCheckOption?: MySqlViewCheckOption): MysqlViewBuilder<Name, Cols, Names>;
  as(query: RtSql): MysqlView<Name, Cols, Names>;
  existing(): MysqlView<Name, Cols, Names>;
}

// Inline maps, never aliases over the builders record: see mysqlTable in ./table.ts.
export function mysqlView<Name extends string, Cols extends Record<string, object>>(
  name: Name,
  columns: Cols
): MysqlViewBuilder<
  Name,
  {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
  {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
>;
export function mysqlView(name: string): ViewFromQueryBuilderNotSupported;
export function mysqlView(name: string, columns?: Record<string, unknown>) {
  return new RtViewBuilder(name, requireColumns('mysqlView', name, columns), mysqlBuildView) as never;
}
