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
  DrizzleContext,
  ExtraConfigScope,
  PlainDataOf,
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

// Column types: one optional spec sentinel per column, every flag derived lazily from its props.
export type {
  AnyColumn,
  AnyNamedColumn,
  ColBaseFlag,
  ColModName,
  ColMods,
  ColRef,
  ColSpecOf,
  Column,
  EntryColRefs,
  InsertKindOf,
  IsHasDefault,
  IsInsertExcluded,
  IsNotNull,
  KeyFlagsOf,
  Merge,
  NamedColumn,
  NoProps,
  Only,
  PropsOf,
  RuntimeModKeys,
  SelectValueOf,
  Sql,
  TableEntry,
  ValueOf,
  Writable,
} from './columns.ts';
export {$type, colModNames, isColModName, rtColSpecKey, rtEntrySpecKey, rtSqlTextKey} from './columns.ts';
export type {rtColNameKey, rtNamedColumnKey} from './columns.ts';
export {recordColumn} from './columnRecorder.ts';

// Table core.
export type {
  AnyTable,
  AnyTableRef,
  EntryColumn,
  BuildTableFn,
  ColsOf,
  DbNameOf,
  NamesOf,
  NoNames,
  RtTableBrand,
  RtTableMeta,
  TableNameOf,
  TableRef,
} from './table.ts';
export {createRtTable, materializeRtTable, refColumn, tableRef} from './table.ts';

// View core: manual-column views only, the query-builder form stays on drizzle (see ./view.ts).
export type {AnyView, BuildViewFn, RtViewBrand, RtViewMeta} from './view.ts';
export {isRtView, materializeRtView, RtViewBuilder} from './view.ts';

// Pure-types runtime bridge, which the dialect packages' tableFromType wrappers build on.
export type {ReflectedNode, RuntimeCallbacks, TableDep, TableFromTypeOptions} from './fromType.ts';
export {buildRtTableFromGraph} from './fromType.ts';

// Flat models.
export type {InferInsertModel, InferSelectModel, InferSelectViewModel, InferUpdateModel} from './models.ts';

// Refinement.
export type {RefinedTable, TableRefinements} from './refine.ts';
export {refineTableType} from './refine.ts';
