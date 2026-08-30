/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Flat model derivation for slim tables. Each model is ONE mapped pass
// directly over the columns record: the spike measured the RowOf-intermediate
// route through the standard SelectModel/InsertModel/UpdateModel utilities at
// ~1.7x this shape (.claude/skills/drizzle-slim-schemas/ARCHITECTURE.md). The
// SEMANTICS are exactly those utilities', mirroring drizzle's own rules
// (drizzle-orm operations.d.ts):
//   select  every column present; nullable ones as `Data | null`.
//   insert  required = notNull without a default; defaulted ones optional;
//           nullable ones optional `Data | null`; generatedAlwaysAs and
//           identity-always columns (insertExcluded) removed.
//   update  any subset of the insert payload.
// A VIEW is read-only, so it gets InferSelectViewModel and nothing else,
// mirroring drizzle's own split between InferSelectModel and
// InferSelectViewModel.

import type {ColBrandOf} from './recorder.ts';
import type {AnyRtTable, ColsOf} from './table.ts';
import type {AnyRtView, ViewColsOf} from './view.ts';

type Prettify<T> = {[K in keyof T]: T[K]} & {};

// Every rule below reads ONE payload per column (ColBrandOf) and matches on it
// structurally, instead of probing the brand once per flag. The probes are what
// the four Col*Of helpers do, and the insert model needs three of them.
type SelectValue<B> = B extends {data: infer Data; notNull: true} ? Data : B extends {data: infer Data} ? Data | null : never;

type SelectOfCols<C> = {
  [K in keyof C]: SelectValue<ColBrandOf<C[K]>>;
};
type InsertOfCols<C> = {
  [K in keyof C as ColBrandOf<C[K]> extends {insertExcluded: true}
    ? never
    : ColBrandOf<C[K]> extends {notNull: true}
      ? ColBrandOf<C[K]> extends {hasDefault: true}
        ? never
        : K
      : never]: SelectValue<ColBrandOf<C[K]>>;
} & {
  [K in keyof C as ColBrandOf<C[K]> extends {insertExcluded: true}
    ? never
    : ColBrandOf<C[K]> extends {notNull: true}
      ? ColBrandOf<C[K]> extends {hasDefault: true}
        ? K
        : never
      : K]?: SelectValue<ColBrandOf<C[K]>>;
};
type UpdateOfCols<C> = {
  [K in keyof C as ColBrandOf<C[K]> extends {insertExcluded: true} ? never : K]?: SelectValue<ColBrandOf<C[K]>>;
};

/** Row model of a (refined) slim table: every column, nullable ones as `| null`. */
export type InferSelectModel<T extends AnyRtTable> = Prettify<SelectOfCols<ColsOf<T>>>;
/** Row model of a slim VIEW. A SEPARATE name, exactly as drizzle splits
 *  InferSelectModel (tables) from InferSelectViewModel (views): keeping the two
 *  apart is what makes InferInsertModel<typeof someView> a compile error, and
 *  it costs the table path nothing (a shared entry point would need a
 *  conditional, measured at +14 net instantiations on every declared table). */
export type InferSelectViewModel<V extends AnyRtView> = Prettify<SelectOfCols<ViewColsOf<V>>>;
/** Insert payload: generated columns removed, defaulted and nullable ones optional. */
export type InferInsertModel<T extends AnyRtTable> = Prettify<InsertOfCols<ColsOf<T>>>;
/** Update payload: any subset of the insert payload. */
export type InferUpdateModel<T extends AnyRtTable> = Prettify<UpdateOfCols<ColsOf<T>>>;
