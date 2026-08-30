/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The sqlite view factory: drizzle-identical call shapes for the MANUAL-COLUMN
// form (explicit columns, then `.as(sql`...`)` or `.existing()`), recorder
// returns. sqlite views take no pre-terminal options, so there is no chain.
// Nothing here imports drizzle; the buildView closure receives the injected
// context at materialization (./drizzle.ts).
//
// `sqliteView(name)` with no columns, drizzle's query-builder form, is declared
// but not supported: its columns come from drizzle's select typing, the exact
// generic chain the slim design removes (packages/drizzle-orm/CLAUDE.md).

import type {AnyRtColumn, DrizzleContext, RtSql, RtViewBrand, RtViewMeta} from '@mionjs/drizzle-orm';
import {RtViewBuilder} from '@mionjs/drizzle-orm';

/** A sqlite slim view: the view metadata, tagged with the dialect that
 *  recorded it, so it cannot reach another dialect's toDrizzle. */
export interface SqliteSlimView<TName extends string, Cols> extends RtViewMeta<TName, Cols>, RtViewBrand<'sqlite'> {}
/** The stand-in a columnless `sqliteView(name)` returns: it has no `as`, so the
 *  query-builder form fails at the call that would use it, naming itself. */
export interface ViewFromQueryBuilderNotSupported {
  readonly __use_drizzles_sqliteView_for_query_builder_views: never;
}

export interface SQLiteViewBuilder<TName extends string, Cols extends Record<string, AnyRtColumn>> {
  /** The view's query, as literal sql. */
  as(query: RtSql): SqliteSlimView<TName, Cols>;
  /** The view already exists: drizzle-kit emits no CREATE VIEW for it. */
  existing(): SqliteSlimView<TName, Cols>;
}

/** The sqlite buildView closure. */
export function sqliteBuildView(context: DrizzleContext, name: string, builders: Record<string, unknown>): unknown {
  return context.ns.sqliteView(name as never, builders as never);
}

export function sqliteView<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: Cols
): SQLiteViewBuilder<TName, Cols>;
export function sqliteView(name: string): ViewFromQueryBuilderNotSupported;
export function sqliteView(name: string, columns?: Record<string, unknown>) {
  return new RtViewBuilder(name, requireColumns('sqliteView', name, columns), sqliteBuildView) as never;
}

/** drizzle exports the same factory twice; so do we, so a translated schema
 *  file keeps whichever name it used. */
export const view: typeof sqliteView = sqliteView;

/** The runtime half of the unsupported query-builder form: typed code cannot
 *  reach it, but plain JS and `as any` can, so it fails with the same reason. */
export function requireColumns(fn: string, name: string, columns: Record<string, unknown> | undefined): Record<string, unknown> {
  if (columns !== undefined) return columns;
  throw new Error(
    `@mionjs/drizzle-orm-sqlite-core: ${fn}('${name}') without columns builds the view from a drizzle query builder, ` +
      'which the slim surface does not carry. Either declare the columns explicitly and use .as(sql`...`), ' +
      'or declare this view with drizzle itself over your toDrizzle() tables.'
  );
}
