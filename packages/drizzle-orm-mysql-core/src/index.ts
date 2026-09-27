/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Every function RECORDS the call instead of running drizzle. Coverage is gated by manifests/mysql.manifest.json;
// the mapping rules live in the drizzle-slim-schemas skill.

// The mysql column builders and their column types.
export * from './columns.ts';
// The shared types.
export * from './types.ts';

export {mysqlTable, mysqlTableCreator, mysqlSchema, tableFromType} from './table.ts';
export type {
  CheckEntry,
  ForeignKeyEntry,
  IndexEntry,
  MySqlSchema,
  MysqlExtraConfigColumns,
  MysqlExtraConfigEntry,
  MysqlExtraConfigFn,
  MysqlTable,
  PrimaryKeyEntry,
  UniqueEntry,
  UniqueIndexEntry,
} from './table.ts';

// The pure-types road: the sql and entry carriers are shared with the core package.
export type {ColRef, Sql, TableEntry} from '@mionjs/drizzle-orm';

// Enums, indexes, constraints and checks.
export * from './helpers.ts';

// Views, the manual-column form only (the query-builder form stays on drizzle).
export {mysqlView} from './views.ts';
export type {
  MySqlViewAlgorithm,
  MySqlViewCheckOption,
  MySqlViewSecurity,
  MysqlView,
  MysqlViewBuilder,
  ViewFromQueryBuilderNotSupported,
} from './views.ts';

// MySqlDate doubles as `Date`, the same global-shadowing convention the runtype formats use.
export type {MySqlDate as Date} from './columns.ts';
