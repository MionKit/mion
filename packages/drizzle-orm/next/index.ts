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
  ColumnOwner,
  InsertKindOf,
  KeyFlagsOf,
  Merge,
  NoProps,
  RefOf,
  SelectValueOf,
  SelfRef,
  ValueOf,
  Writable,
} from './columns.ts';
export {$type, rtColOwnerKey, rtColSpecKey} from './columns.ts';
export type {rtColNameKey, rtNamedColumnKey} from './columns.ts';
export {recordColumn} from './recorder.ts';
export type {
  AnyTable,
  AnyView,
  ColsOf,
  ColsView,
  DbNameOf,
  NamesOf,
  NoNames,
  RtTableMeta,
  RtViewMeta,
  TableNameOf,
} from './table.ts';
export {cols} from './table.ts';
export type {InferInsertModel, InferSelectModel, InferSelectViewModel, InferUpdateModel} from './models.ts';
export type {RefinedTable, TableRefinements} from './refine.ts';
export {refineTableType} from './refine.ts';
export type {RuntimeCallbacks, TableFromTypeOptions} from './fromType.ts';
export {buildRtTableFromGraph} from './fromType.ts';
