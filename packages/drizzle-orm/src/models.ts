/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Flat model derivation for slim tables. Each model is ONE mapped pass
// directly over the columns record: the spike measured the RowOf-intermediate
// route through the standard SelectModel/InsertModel/UpdateModel utilities at
// ~1.7x this shape (docs/todos/drizzle-slim-builders.md, stage-1 result). The
// SEMANTICS are exactly those utilities', mirroring drizzle's own rules
// (drizzle-orm operations.d.ts):
//   select  every column present; nullable ones as `Data | null`.
//   insert  required = notNull without a default; defaulted ones optional;
//           nullable ones optional `Data | null`; generatedAlwaysAs and
//           identity-always columns (insertExcluded) removed.
//   update  any subset of the insert payload.

import type {ColDataOf, ColHasDefaultOf, ColInsertExcludedOf, ColNotNullOf} from './recorder.ts';
import type {AnyRtTable, ColsOf} from './table.ts';

type Prettify<T> = {[K in keyof T]: T[K]} & {};

type SelectOfCols<C> = {
  [K in keyof C]: ColNotNullOf<C[K]> extends true ? ColDataOf<C[K]> : ColDataOf<C[K]> | null;
};
type InsertOfCols<C> = {
  [K in keyof C as ColInsertExcludedOf<C[K]> extends true
    ? never
    : ColNotNullOf<C[K]> extends true
      ? ColHasDefaultOf<C[K]> extends true
        ? never
        : K
      : never]: ColDataOf<C[K]>;
} & {
  [K in keyof C as ColInsertExcludedOf<C[K]> extends true
    ? never
    : ColNotNullOf<C[K]> extends true
      ? ColHasDefaultOf<C[K]> extends true
        ? K
        : never
      : K]?: ColNotNullOf<C[K]> extends true ? ColDataOf<C[K]> : ColDataOf<C[K]> | null;
};
type UpdateOfCols<C> = {
  [K in keyof C as ColInsertExcludedOf<C[K]> extends true ? never : K]?: ColNotNullOf<C[K]> extends true
    ? ColDataOf<C[K]>
    : ColDataOf<C[K]> | null;
};

/** Row model of a (refined) slim table: every column, nullable ones as `| null`. */
export type InferSelectModel<T extends AnyRtTable> = Prettify<SelectOfCols<ColsOf<T>>>;
/** Insert payload: generated columns removed, defaulted and nullable ones optional. */
export type InferInsertModel<T extends AnyRtTable> = Prettify<InsertOfCols<ColsOf<T>>>;
/** Update payload: any subset of the insert payload. */
export type InferUpdateModel<T extends AnyRtTable> = Prettify<UpdateOfCols<ColsOf<T>>>;
