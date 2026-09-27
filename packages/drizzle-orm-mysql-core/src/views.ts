/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The mysql view factory, MANUAL-COLUMN form only: explicit columns, then `.as(sql`...`)` or `.existing()`. Nothing
// here imports drizzle; the buildView closure receives the injected context at materialization (./drizzle.ts).
// `mysqlView(name)` with no columns, drizzle's query-builder form, is declared but NOT supported: its columns come
// from drizzle's select typing, the exact generic chain the slim design removes (packages/drizzle-orm/CLAUDE.md).

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

export interface ViewFromQueryBuilderNotSupported {
  readonly __use_drizzles_mysqlView_for_query_builder_views: never;
}

export type MySqlViewAlgorithm = 'undefined' | 'merge' | 'temptable';
export type MySqlViewSecurity = 'definer' | 'invoker';
export type MySqlViewCheckOption = 'local' | 'cascaded';

export function mysqlBuildView(context: DrizzleContext, name: string, builders: Record<string, unknown>): unknown {
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

// Inline maps, never aliases over the builders record: see mysqlTable in ./table.ts.
type NameOf<C> = C extends {readonly [rtColNameKey]: infer Name} ? Name : undefined;

export interface MysqlView<TName extends string, Cols, Names = NoNames>
  extends RtViewMeta<TName, Cols, Names>, RtViewBrand<'mysql'> {}
export type AnyMysqlView = MysqlView<string, Record<string, AnyColumn>, object>;

export interface MysqlViewBuilder<TName extends string, Cols, Names> {
  algorithm(algorithm: MySqlViewAlgorithm): MysqlViewBuilder<TName, Cols, Names>;
  sqlSecurity(sqlSecurity: MySqlViewSecurity): MysqlViewBuilder<TName, Cols, Names>;
  withCheckOption(withCheckOption?: MySqlViewCheckOption): MysqlViewBuilder<TName, Cols, Names>;
  as(query: RtSql): MysqlView<TName, Cols, Names>;
  existing(): MysqlView<TName, Cols, Names>;
}

export function mysqlView<TName extends string, Cols extends Record<string, object>>(
  name: TName,
  columns: Cols
): MysqlViewBuilder<
  TName,
  {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
  {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
>;
export function mysqlView(name: string): ViewFromQueryBuilderNotSupported;
export function mysqlView(name: string, columns?: Record<string, unknown>) {
  return new RtViewBuilder(name, requireColumns('mysqlView', name, columns), mysqlBuildView) as never;
}
