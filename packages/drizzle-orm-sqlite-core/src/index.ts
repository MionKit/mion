/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// @mionjs/drizzle-orm-sqlite-core — the slim sqlite authoring surface: tables are written exactly
// as drizzle tables, every function records instead of running drizzle, and toDrizzle on the
// './drizzle' subpath is the one module that imports drizzle-orm (an optional peer).
// Coverage is gated by manifests/sqlite.manifest.json; the mapping rules live in the
// drizzle-slim-schemas skill.

// The sqlite column builders, their column types, and the two kind interfaces.
export * from './columns.ts';

export {sqliteTable, sqliteTableCreator, tableFromType} from './table.ts';
export type {
  CheckEntry,
  ForeignKeyEntry,
  IndexEntry,
  PrimaryKeyEntry,
  AnySqliteTable,
  AnySqliteView,
  SqliteExtraConfigColumns,
  SqliteExtraConfigEntry,
  SqliteExtraConfigFn,
  SqliteTable,
  UniqueEntry,
  UniqueIndexEntry,
} from './table.ts';

// The pure-types road: SqliteColMods lives in ./columns.ts, so only the sql and entry carriers are shared.
export type {ColRef, Sql, TableEntry} from '@mionjs/drizzle-orm';

// Indexes, constraints and checks.
export * from './helpers.ts';

// Views, the manual-column form only (the query-builder form stays on drizzle).
// Exported under BOTH names drizzle uses.
export {sqliteView, view} from './views.ts';
export type {SQLiteViewBuilder, ViewFromQueryBuilderNotSupported} from './views.ts';
