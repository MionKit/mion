/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The dialect-agnostic core behind the @mionjs/drizzle-orm-<dialect>-core packages.
// Nothing here imports drizzle-orm; the dialect packages inject it at materialization
// (their toDrizzle module), which makes drizzle-orm an optional peer of the family.
// Consumers import this shared surface from HERE and the builders from their dialect
// package; the dialect packages re-export nothing of it.

// Recorder core.
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
  rtTableBrand,
  rtTableKey,
  rtValueKey,
  rtViewBrand,
  rtViewKey,
  sql,
} from './recorder.ts';

// Table core.
export type {AnyRtTable, BuildTableFn, ColsOf, RtTableBrand, RtTableMeta, TableNameOf} from './table.ts';
export {cols, createRtTable, materializeRtTable} from './table.ts';

// View core: manual-column views only, the query-builder form stays on drizzle (see ./view.ts).
export type {AnyRtView, BuildViewFn, RtViewBrand, RtViewMeta, ViewColsOf, ViewNameOf} from './view.ts';
export {isRtView, materializeRtView, RtViewBuilder} from './view.ts';

// Pure-types vocabulary core, including the sentinels reflection reads the builder calls back out of.
export type {
  AnyRtColType,
  ColBaseFlag,
  ColConfigArg,
  ColDbNameOf,
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

// Pure-types runtime bridge, which the dialect packages' tableFromType wrappers build on.
export type {ReflectedNode, RuntimeCallbacks, TableFromTypeOptions} from './fromType.ts';
export {buildRtTableFromGraph} from './fromType.ts';

// Flat models.
export type {InferInsertModel, InferSelectModel, InferSelectViewModel, InferUpdateModel} from './models.ts';

// Refinement.
export type {RefinedTable, RtRefinedColumn, TableRefinements} from './refine.ts';
export {refineTableType} from './refine.ts';
