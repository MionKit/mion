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

// The shared type vocabulary.
export type {
  AnyColumn,
  AnyTable,
  AnyTableRef,
  BuildTableFn,
  BuildViewFn,
  ColBaseFlag,
  ColMods,
  ColRef,
  ColSpecOf,
  Column,
  DbNameOf,
  DrizzleContext,
  EntryColRefs,
  EntryColumn,
  ExtraConfigScope,
  IsHasDefault,
  IsInsertExcluded,
  IsNotNull,
  KeyFlagsOf,
  LiftCols,
  Merge,
  NameOf,
  NamedColumn,
  NoNames,
  NoProps,
  Only,
  PropsOf,
  ReflectedNode,
  RtExtraColumn,
  RtIndexedColumn,
  RtSql,
  RtTableBrand,
  RtTableMeta,
  RtViewBrand,
  RtViewMeta,
  RuntimeCallbacks,
  Sql,
  SqlNamespace,
  TableDep,
  TableEntry,
  TableFromTypeOptions,
  TableRef,
  ValueOf,
  Writable,
} from './types.ts';

// Recorder core.
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

// Column runtime.
export type {ColModName} from './columns.ts';
export {$type, colModNames, isColModName, rtColSpecKey, rtEntrySpecKey, rtSqlTextKey} from './columns.ts';
export type {rtColNameKey, rtNamedColumnKey} from './columns.ts';
export {recordColumn, recordNsColumn} from './columnRecorder.ts';

// Table core.
export {createRtTable, materializeRtTable, tableRef} from './table.ts';

// View core: manual-column views only, the query-builder form stays on drizzle (see ./view.ts).
export {isRtView, materializeRtView, RtViewBuilder} from './view.ts';

// Pure-types runtime bridge, which the dialect packages' tableFromType wrappers build on.
export {buildRtTableFromGraph, rtTableFromRunType} from './fromType.ts';

// Flat models.
export type {
  InferInsertModel,
  InferSelectModel,
  InferSelectViewModel,
  InsertModelOf,
  RtTableInfer,
  RtViewInfer,
  SelectModelOf,
} from './models.ts';

// Refinement.
export type {RefinedTable, TableRefinements} from './refine.ts';
export {refineTableType} from './refine.ts';
