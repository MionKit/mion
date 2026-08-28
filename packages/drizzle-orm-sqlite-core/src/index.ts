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
// in the drizzle-proxy-migration skill.

export type {
  AnyRtColumn,
  AnyRtTable,
  ColDataOf,
  ColHasDefaultOf,
  ColInsertExcludedOf,
  ColNotNullOf,
  ColsOf,
  InferInsert,
  InferSelect,
  InferUpdate,
  RefinedTable,
  RtColumnBrand,
  RtIndexedColumn,
  RtRefinedColumn,
  RtSql,
  RtTable,
  RtTableMeta,
  TableNameOf,
  TableRefinements,
} from '@mionjs/drizzle-orm';
export {refineTableType, sql, rtColumnKey, rtTableKey} from '@mionjs/drizzle-orm';

export type {InsertModel, SelectModel, UpdateModel} from '@ts-runtypes/core';

export * from './columns.ts';
export {sqliteTable, sqliteTableCreator} from './table.ts';
export type {SqliteExtraConfigColumns, SqliteExtraConfigFn} from './table.ts';
export * from './helpers.ts';
