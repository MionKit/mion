/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Side-by-side column system, not exported by the package: tests and the type budget import it by path.

export type {
  AnyColumn,
  ColBaseFlag,
  ColSpecOf,
  Column,
  AnyNamedColumn,
  NamedColumn,
  PropsOf,
  RuntimeModKeys,
  InsertKindOf,
  KeyFlagsOf,
  Merge,
  NoProps,
  Only,
  SelectValueOf,
  ValueOf,
  Writable,
} from './columns.ts';
export {$type, rtColSpecKey} from './columns.ts';
export type {rtColNameKey, rtNamedColumnKey} from './columns.ts';
export {recordColumn} from './recorder.ts';
export type {
  AnyTable,
  AnyTableRef,
  AnyView,
  ColsOf,
  DbNameOf,
  NamesOf,
  NoNames,
  RtTableMeta,
  RtViewMeta,
  TableNameOf,
  TableRef,
} from './table.ts';
export {refColumn, tableRef} from './table.ts';
export type {InferInsertModel, InferSelectModel, InferSelectViewModel, InferUpdateModel} from './models.ts';
export type {RefinedTable, TableRefinements} from './refine.ts';
export {refineTableType} from './refine.ts';
export type {RuntimeCallbacks, TableFromTypeOptions} from './fromType.ts';
export {buildRtTableFromGraph} from './fromType.ts';
