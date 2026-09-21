/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// @mionjs/drizzle-orm-mysql-core — the slim mysql authoring surface: tables are written exactly as
// drizzle tables, every function records instead of running drizzle, and toDrizzle on the
// './drizzle' subpath is the one module that imports drizzle-orm (an optional peer).
// Coverage is gated by manifests/mysql.manifest.json; the mapping rules live in the
// drizzle-slim-schemas skill.

// The mysql column builders, their column types, and the three kind interfaces.
export * from './columns.ts';

export {mysqlTable, mysqlTableCreator, mysqlSchema, tableFromType} from './table.ts';
export type {
  CheckEntry,
  ForeignKeyEntry,
  IndexEntry,
  MyExtraConfigColumns,
  MyExtraConfigEntry,
  MyExtraConfigFn,
  MySqlSchema,
  AnyMysqlTable,
  AnyMysqlView,
  MysqlTable,
  PrimaryKeyEntry,
  UniqueEntry,
  UniqueIndexEntry,
} from './table.ts';

// The pure-types road: the modifier bags live in ./columns.ts, so only the sql and entry carriers are shared.
export type {ColRef, Sql, TableEntry} from '@mionjs/drizzle-orm';

// Indexes, constraints and checks.
export * from './helpers.ts';

// Views, the manual-column form only (the query-builder form stays on drizzle).
export {mysqlView} from './views.ts';
export type {
  MySqlViewAlgorithm,
  MySqlViewBuilder,
  MySqlViewCheckOption,
  MySqlViewSecurity,
  ViewFromQueryBuilderNotSupported,
} from './views.ts';

// MySqlDate doubles as `Date`, the same global-shadowing convention the runtype formats use.
export type {MySqlDate as Date} from './columns.ts';
