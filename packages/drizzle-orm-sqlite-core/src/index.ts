/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// @mionjs/drizzle-orm-sqlite-core — the slim sqlite authoring surface: tables
// are written exactly as drizzle tables, every function records instead of
// running drizzle, models derive flat and the real drizzle table materializes
// on demand via toDrizzle on the './drizzle' subpath — the one module that
// imports drizzle-orm (an optional peer).
// Coverage is gated by manifests/sqlite.manifest.json; the mapping rules live
// in the drizzle-slim-schemas skill.

// The sqlite column builders, their column types, and the kind interface.
export * from './columns.ts';

// The table factories.
export {sqliteTable, sqliteTableCreator, tableFromType} from './table.ts';
export type {
  CheckEntry,
  ForeignKeyEntry,
  IndexEntry,
  PrimaryKeyEntry,
  SqliteBuilderTable,
  SqliteExtraConfigColumns,
  SqliteExtraConfigEntry,
  SqliteExtraConfigFn,
  SqliteTable,
  UniqueEntry,
  UniqueIndexEntry,
} from './table.ts';

// The pure-types road. A column type takes its modifier calls as props
// (SqliteColMods lives beside the builders in ./columns.ts), so the only
// shared pieces left here are the literal sql carrier and the table-entry
// carrier.
export type {ColRef, Sql, TableEntry} from '@mionjs/drizzle-orm';

// Indexes, constraints and checks.
export * from './helpers.ts';

// Views, the manual-column form only (the query-builder form stays on drizzle).
// Exported under BOTH names drizzle uses.
export {sqliteView, view} from './views.ts';
export type {SQLiteViewBuilder, ViewFromQueryBuilderNotSupported} from './views.ts';
