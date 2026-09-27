/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Every function RECORDS the call instead of running drizzle. Coverage is gated by manifests/sqlite.manifest.json;
// the mapping rules live in the drizzle-slim-schemas skill.

// The sqlite column builders and their column types.
export * from './columns.ts';
// The config, data and modifier-bag types the builders and column types share.
export * from './types.ts';

export {sqliteTable, sqliteTableCreator, tableFromType} from './table.ts';
export type {
  AnySqliteTable,
  CheckEntry,
  ForeignKeyEntry,
  IndexEntry,
  LiftCols,
  PrimaryKeyEntry,
  SqliteExtraConfigColumns,
  SqliteExtraConfigEntry,
  SqliteExtraConfigFn,
  SqliteTable,
  SqliteTableCreatorFn,
  UniqueEntry,
  UniqueIndexEntry,
} from './table.ts';

// The pure-types road: the sql and entry carriers are shared with the core package.
export type {ColRef, Sql, TableEntry} from '@mionjs/drizzle-orm';

// Indexes, constraints and checks.
export * from './helpers.ts';

// Views, the manual-column form only (the query-builder form stays on drizzle), under BOTH names drizzle uses.
export {sqliteView, view} from './views.ts';
export type {AnySqliteView, SqliteView, SqliteViewBuilder, ViewFromQueryBuilderNotSupported} from './views.ts';
