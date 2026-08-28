/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// @mionjs/drizzle-orm-pg-core — the slim pg authoring surface: tables are
// written exactly as drizzle tables (same builder names, same params, same
// modifier chains, same extraConfig and helpers), but every function here
// RECORDS the call instead of running drizzle, and the returned types carry
// only the runtype-format data type plus three flags. Models derive flat
// (InferSelect/InferInsert/InferUpdate), refinement merges format params flat
// (refineTableType), and the real drizzle table materializes on demand via
// toDrizzle on the './drizzle' subpath — the ONE module that imports
// drizzle-orm, which is an optional peer.
// Coverage is gated by manifests/pg.manifest.json
// (`pnpm rtx core drizzle-manifest --check`); the mapping rules live in the
// drizzle-proxy-migration skill.

// The dialect-agnostic core: models, refinement, sql, brands and extractors.
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

// The standard model utilities stay re-exported so consumers get the whole
// model vocabulary from this one package (hand-written row types included).
export type {InsertModel, SelectModel, UpdateModel} from '@ts-runtypes/core';

// The pg column builders, their named data types, and the four kind interfaces.
export * from './columns.ts';

// The table factories and schema handles.
export {pgTable, pgTableCreator, pgSchema} from './table.ts';
export type {PgExtraConfigColumns, PgExtraConfigFn, PgSchema, PgSequence, PgSequenceOptions} from './table.ts';

// Indexes, constraints, checks, enums, sequences, policies, roles.
export * from './helpers.ts';

// The pure-types vocabulary alias for the date column (the other named types
// live beside their builders in ./columns.ts; PgDate doubles as `Date`, the
// same global-shadowing convention the runtype formats use).
export type {PgDate as Date} from './columns.ts';
