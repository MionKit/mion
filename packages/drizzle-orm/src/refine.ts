/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Type-level table refinement over slim tables: tighten a column's captured
// format params for the API without touching the database column. Identity at
// runtime; the merge is the standard MergeFormat/RefinableParamsOf machinery
// from @ts-runtypes/core, applied to the flat column brand instead of drizzle
// column configs (which is what turned the old implementation's 4365 net
// instantiations into ~380).

import type {MergeFormat, RefinableParamsOf} from '@ts-runtypes/core/formats';
import type {ColBrandOf, ColDataOf, RtColumnBrand} from './recorder.ts';
import type {AnyRtTable, ColsOf} from './table.ts';

/** Per-column refinement params accepted for table T: only format-carrying
 *  columns are refinable (a passthrough boolean/json/enum column refines to
 *  `never`, so ANY refinement on it is a compile error — never a silent
 *  bypass). */
export type TableRefinements<T extends AnyRtTable> = {
  [K in keyof ColsOf<T>]?: RefinableParamsOf<ColDataOf<ColsOf<T>[K]>>;
};

/** Post-refine column: the brand alone. The table object is already built, so
 *  nothing chains after refineTableType and the modifier methods are not
 *  carried over. */
export type RtRefinedColumn<
  Data,
  NotNull extends boolean,
  HasDefault extends boolean,
  InsertExcluded extends boolean,
> = RtColumnBrand<Data, NotNull, HasDefault, InsertExcluded>;

// RtColumnBrand spelled directly (not the RtRefinedColumn alias): one fewer
// alias instantiation per refined column, type-budget sensitive. The three
// flags come off ONE payload read rather than one probe each.
type RefinedBrand<Brand, Params> = Brand extends {
  data: infer Data;
  notNull: infer NotNull extends boolean;
  hasDefault: infer HasDefault extends boolean;
  insertExcluded: infer InsertExcluded extends boolean;
}
  ? RtColumnBrand<MergeFormat<Data, Params>, NotNull, HasDefault, InsertExcluded>
  : never;

type RefineCols<Cols, R> = {
  [K in keyof Cols]: K extends keyof R ? (R[K] extends object ? RefinedBrand<ColBrandOf<Cols[K]>, R[K]> : Cols[K]) : Cols[K];
};
/** The same table retyped: refined columns carry the merged format params.
 *  This is the type road's refine — `type ApiUsersTable =
 *  RefinedTable<UsersTable, {name: {maxLength: 50}}>` — with R constrained so
 *  a typo'd column or an unrefinable param is a compile error. */
export type RefinedTable<T extends AnyRtTable, R extends TableRefinements<T>> = Omit<T, 'columns'> & {
  columns: RefineCols<ColsOf<T>, R>;
};

/** Tighten a table's column types for the API (stricter than the database):
 *  plain per-column format params, merged into the captured ones (refinement
 *  wins on a shared key; base and value type can never change). Identity at
 *  runtime — returns the SAME table object retyped, so the materialized
 *  drizzle table is shared too. */
export function refineTableType<T extends AnyRtTable, const R extends TableRefinements<T>>(
  table: T,
  refinements: R
): RefinedTable<T, R> {
  void refinements;
  return table as unknown as RefinedTable<T, R>;
}
