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
  ColBrandOf,
  ColDataOf,
  ColKeyFlags,
  ColKeyFlagsOf,
  NoKeyFlags,
  RtColumnKeyBrand,
  SetIdentity,
  SetKeyFlag,
  PlainDataOf,
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
  rtViewKey,
  sql,
} from './recorder.ts';

// Table core.
export type {AnyRtTable, BuildTableFn, ColsOf, RtTable, RtTableMeta, RtTableMetaWithExtras, TableNameOf} from './table.ts';
export {createRtTable, materializeRtTable} from './table.ts';

// View core: the read-only sibling of the table core. Manual-column views
// only; the query-builder form stays on drizzle (see ./view.ts and CLAUDE.md).
export type {AnyRtView, BuildViewFn, RtView, RtViewMeta, ViewColsOf, ViewNameOf} from './view.ts';
export {isRtView, materializeRtView, RtViewBuilder} from './view.ts';

// Pure-types vocabulary core: the column type the dialect packages alias per
// builder, the modifier vocabulary it takes, and the sentinels reflection
// reads the builder calls back out of.
export type {
  AnyRtColType,
  ColBaseFlag,
  ColConfigArg,
  ColModName,
  ColMods,
  ColNameArg,
  ColRef,
  ColSpecOf,
  EntryColRefs,
  RtColType,
  RtTypedColumn,
  Sql,
  TableEntry,
  TypedCols,
} from './typeColumns.ts';
export {colModNames, isColModName} from './typeColumns.ts';
export {rtColModsKey, rtColSpecKey, rtEntrySpecKey, rtSqlTextKey} from './typeColumns.ts';

// Pure-types runtime bridge: rebuilds a slim table from a reflected type-road
// table graph (the dialect packages' tableFromType wrappers build on it).
export type {ReflectedNode, RuntimeCallbacks, TableFromTypeOptions} from './fromType.ts';
export {buildRtTableFromGraph} from './fromType.ts';

// Flat models.
export type {InferInsertModel, InferSelectModel, InferSelectViewModel, InferUpdateModel} from './models.ts';

// Refinement.
export type {RefinedTable, RtRefinedColumn, TableRefinements} from './refine.ts';
export {refineTableType} from './refine.ts';
