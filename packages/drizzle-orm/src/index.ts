/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// @mionjs/drizzle-orm — the dialect-agnostic core behind the
// @mionjs/drizzle-orm-<dialect>-core packages: slim column/table recorders,
// flat model derivation, type-level refinement, and the sql recorder. Nothing
// here imports drizzle-orm; the dialect packages inject it at materialization
// (their toDrizzle module), which is what makes drizzle-orm an optional peer
// of the whole family. Consumers import this shared surface (models,
// refineTableType, sql) from THIS package and the dialect-specific builders
// from their dialect package; the dialect packages re-export nothing of it.

// Recorder core: brands, extractors, the runtime recorder classes the dialect
// packages build their column functions and authoring helpers on.
export type {
  AnyRtColumn,
  ColDataOf,
  ColHasDefaultOf,
  ColInsertExcludedOf,
  ColNotNullOf,
  DrizzleContext,
  ExtraConfigScope,
  RtColumnBrand,
  RtExtraColumn,
  RtIndexedColumn,
  RtSql,
  SqlNamespace,
} from './recorder.ts';
export {
  RtColumnRecorder,
  RtEntryRecorder,
  RtSqlRecorder,
  RtValueRecorder,
  mapRecordedArgs,
  mapReplayArgs,
  rtColumnKey,
  rtTableKey,
  rtValueKey,
  sql,
} from './recorder.ts';

// Table core.
export type {AnyRtTable, BuildTableFn, ColsOf, RtTable, RtTableMeta, TableNameOf} from './table.ts';
export {createRtTable, materializeRtTable} from './table.ts';

// Flat models.
export type {InferInsertModel, InferSelectModel, InferUpdateModel} from './models.ts';

// Refinement.
export type {RefinedTable, RtRefinedColumn, TableRefinements} from './refine.ts';
export {refineTableType} from './refine.ts';
