/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// MANUAL-COLUMN views only. `sqliteView(name)` with no columns (the query-builder form) is NOT supported: its columns
// come from drizzle's select typing (packages/drizzle-orm/CLAUDE.md).

import type {DrizzleContext, NameOf, NoNames, RtSql, RtViewBrand, RtViewMeta, rtNamedColumnKey} from '@mionjs/drizzle-orm';
import {RtViewBuilder} from '@mionjs/drizzle-orm';

/** The stand-in a columnless `sqliteView(name)` returns: no `as`, so the query-builder form fails naming itself. */
export interface ViewFromQueryBuilderNotSupported {
  readonly __use_drizzles_sqliteView_for_query_builder_views: never;
}

export function sqliteBuildView(context: DrizzleContext, name: string, builders: Record<string, unknown>): unknown {
  return context.ns.sqliteView(name as never, builders as never);
}

/** The runtime half of the unsupported query-builder form: typed code cannot reach it, plain JS can. */
export function requireColumns(fn: string, name: string, columns: Record<string, unknown> | undefined): Record<string, unknown> {
  if (columns !== undefined) return columns;
  throw new Error(
    `@mionjs/drizzle-orm-sqlite-core: ${fn}('${name}') without columns builds the view from a drizzle query builder, ` +
      'which the slim surface does not carry. Either declare the columns explicitly and use .as(sql`...`), ' +
      'or declare this view with drizzle itself over your toDrizzle() tables.'
  );
}

export interface SqliteView<Name extends string, Cols, Names = NoNames>
  extends RtViewMeta<Name, Cols, Names>, RtViewBrand<'sqlite'> {}
// sqlite views take no options before the terminal call.
export interface SqliteViewBuilder<Name extends string, Cols, Names> {
  as(query: RtSql): SqliteView<Name, Cols, Names>;
  existing(): SqliteView<Name, Cols, Names>;
}

// Inline maps, never aliases over the builders record: see sqliteTable in ./table.ts.
export function sqliteView<Name extends string, Cols extends Record<string, object>>(
  name: Name,
  columns: Cols
): SqliteViewBuilder<
  Name,
  {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]},
  {[K in keyof Cols as NameOf<Cols[K]> extends string ? (NameOf<Cols[K]> extends K ? never : K) : never]: NameOf<Cols[K]>}
>;
export function sqliteView(name: string): ViewFromQueryBuilderNotSupported;
export function sqliteView(name: string, columns?: Record<string, unknown>) {
  return new RtViewBuilder(name, requireColumns('sqliteView', name, columns), sqliteBuildView) as never;
}

/** drizzle exports the same factory twice, so a translated schema file keeps whichever name it used. */
export const view: typeof sqliteView = sqliteView;
