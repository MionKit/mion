/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Type-level table refinement over slim tables: tighten a column's captured format params for the API
// without touching the database column. The merge is @mionjs/run-types' MergeFormat/RefinableParamsOf
// applied to the flat column brand instead of drizzle column configs (4365 net instantiations to ~380).

import type {MergeFormat, RefinableParamsOf} from '@mionjs/run-types/formats';
import type {ColBrandOf, ColDataOf, RtColumnBrand} from './recorder.ts';
import type {AnyRtTable, ColsOf} from './table.ts';

/** Only format-carrying columns are refinable: a passthrough boolean/json/enum column refines to
 *  `never`, so ANY refinement on it is a compile error rather than a silent bypass. */
export type TableRefinements<T extends AnyRtTable> = {
  [K in keyof ColsOf<T>]?: RefinableParamsOf<ColDataOf<ColsOf<T>[K]>>;
};

/** Post-refine column: the brand alone, no modifier methods, since nothing chains after refineTableType. */
export type RtRefinedColumn<
  Data,
  NotNull extends boolean,
  HasDefault extends boolean,
  InsertExcluded extends boolean,
> = RtColumnBrand<Data, NotNull, HasDefault, InsertExcluded>;

// RtColumnBrand spelled directly (not the RtRefinedColumn alias): one fewer alias instantiation per
// refined column, and the three flags come off ONE payload read rather than one probe each.
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
/** The same table retyped, the type road's refine: `RefinedTable<UsersTable, {name: {maxLength: 50}}>`.
 *  R is constrained, so a typo'd column or an unrefinable param is a compile error. */
export type RefinedTable<T extends AnyRtTable, R extends TableRefinements<T>> = Omit<T, 'columns'> & {
  columns: RefineCols<ColsOf<T>, R>;
};

/** Tighten a table's column types for the API (stricter than the database): refinement wins on a
 *  shared key, base and value type can never change. Identity at runtime, so the SAME table object
 *  comes back retyped and the materialized drizzle table is shared too. */
export function refineTableType<T extends AnyRtTable, const R extends TableRefinements<T>>(
  table: T,
  refinements: R
): RefinedTable<T, R> {
  void refinements;
  return table as unknown as RefinedTable<T, R>;
}
