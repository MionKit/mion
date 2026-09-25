/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Side-by-side mysql views, manual-column form only, over the shipped view recorder.

import type {RtSql} from '../../drizzle-orm/src/recorder.ts';
import type {RtViewBrand} from '../../drizzle-orm/src/view.ts';
import {RtViewBuilder} from '../../drizzle-orm/src/view.ts';
import type {AnyColumn} from '../../drizzle-orm/next/columns.ts';
import type {NoNames, RtViewMeta} from '../../drizzle-orm/next/table.ts';
import {mysqlBuildView, type MySqlViewAlgorithm, type MySqlViewCheckOption, type MySqlViewSecurity} from '../src/views.ts';
import type {rtColNameKey, rtNamedColumnKey} from '../../drizzle-orm/next/columns.ts';

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
> {
  return new RtViewBuilder(name, columns, mysqlBuildView) as never;
}
