/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Flat model derivation for slim tables: ONE mapped pass per model directly over the columns
// record, the RowOf-intermediate route through the standard SelectModel/InsertModel/UpdateModel
// utilities having measured at ~1.7x this shape (.claude/skills/drizzle-slim-schemas/ARCHITECTURE.md).
// The SEMANTICS are exactly those utilities', mirroring drizzle's own rules (drizzle-orm operations.d.ts).

import type {ColBrandOf} from './recorder.ts';
import type {AnyRtTable, ColsOf} from './table.ts';
import type {AnyRtView, ViewColsOf} from './view.ts';

type Prettify<T> = {[K in keyof T]: T[K]} & {};

// ColBrandOf reads ONE payload per column; the four Col*Of helpers probe once per flag, and insert needs three.
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
/** Row model of a slim VIEW. A separate name (as in drizzle) makes InferInsertModel<typeof someView>
 *  a compile error; a shared entry point would need a conditional, +14 instantiations per declared table. */
export type InferSelectViewModel<V extends AnyRtView> = Prettify<SelectOfCols<ViewColsOf<V>>>;
/** Insert payload: generated columns removed, defaulted and nullable ones optional. */
export type InferInsertModel<T extends AnyRtTable> = Prettify<InsertOfCols<ColsOf<T>>>;
/** Update payload: any subset of the insert payload. */
export type InferUpdateModel<T extends AnyRtTable> = Prettify<UpdateOfCols<ColsOf<T>>>;
