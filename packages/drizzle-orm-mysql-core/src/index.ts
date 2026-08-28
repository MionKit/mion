/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// @mionjs/drizzle-orm-mysql-core — the slim mysql authoring surface: tables
// are written exactly as drizzle tables, every function records instead of
// running drizzle, models derive flat and the real drizzle table materializes
// on demand via toDrizzle on the './drizzle' subpath — the one module that
// imports drizzle-orm (an optional peer).
// Coverage is gated by manifests/mysql.manifest.json; the mapping rules live
// in the drizzle-proxy-migration skill.

export * from './columns.ts';
export {mysqlTable, mysqlTableCreator, mysqlSchema} from './table.ts';
export type {MyExtraConfigColumns, MyExtraConfigFn, MySqlSchema} from './table.ts';
export * from './helpers.ts';

// The pure-types vocabulary alias for the date column (same global-shadowing
// convention the runtype formats use).
export type {MySqlDate as Date} from './columns.ts';
