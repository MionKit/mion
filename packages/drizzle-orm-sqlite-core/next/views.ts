/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Side-by-side sqlite views, manual-column form only, over the shipped view recorder.

import type {RtSql} from '../../drizzle-orm/src/recorder.ts';
import type {RtViewBrand} from '../../drizzle-orm/src/view.ts';
import {RtViewBuilder} from '../../drizzle-orm/src/view.ts';
import type {AnyColumn} from '../../drizzle-orm/next/columns.ts';
import type {NoNames, RtViewMeta} from '../../drizzle-orm/next/table.ts';
import {requireColumns, sqliteBuildView, type ViewFromQueryBuilderNotSupported} from '../src/views.ts';
import type {rtColNameKey, rtNamedColumnKey} from '../../drizzle-orm/next/columns.ts';

export type {ViewFromQueryBuilderNotSupported} from '../src/views.ts';

// Inline maps, never aliases over the builders record: see sqliteTable in ./table.ts.
type NameOf<C> = C extends {readonly [rtColNameKey]: infer Name} ? Name : undefined;

export interface SqliteView<TName extends string, Cols, Names = NoNames>
  extends RtViewMeta<TName, Cols, Names>, RtViewBrand<'sqlite'> {}
export type AnySqliteView = SqliteView<string, Record<string, AnyColumn>, object>;

// sqlite views take no options before the terminal call.
export interface SqliteViewBuilder<TName extends string, Cols, Names> {
  as(query: RtSql): SqliteView<TName, Cols, Names>;
  existing(): SqliteView<TName, Cols, Names>;
}

export function sqliteView<TName extends string, Cols extends Record<string, object>>(
  name: TName,
  columns: Cols
): SqliteViewBuilder<
  TName,
  {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
  {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
>;
export function sqliteView(name: string): ViewFromQueryBuilderNotSupported;
export function sqliteView(name: string, columns?: Record<string, unknown>) {
  return new RtViewBuilder(name, requireColumns('sqliteView', name, columns), sqliteBuildView) as never;
}

/** drizzle exports the same factory twice, so a translated schema file keeps whichever name it used. */
export const view: typeof sqliteView = sqliteView;
