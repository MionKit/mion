/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A refined column keeps its fn, props and base, so every derived flag survives; only its format params change.

import type {MergeFormat, RefinableParamsOf} from '@mionjs/run-types/formats';
import type {Column, Merge, ValueOf} from './columns.ts';
import {rtColSpecKey} from './columns.ts';
import type {AnyTable} from './table.ts';

type Parts<C> = C extends {readonly [rtColSpecKey]?: {fn: infer Fn extends string; config: infer P; data: infer D; base: infer B}}
  ? [Fn, P, D, B]
  : never;

/** Only format-carrying columns are refinable; any other refines to `never`, so a refinement on it fails. */
export type TableRefinements<T extends AnyTable> = {
  [K in keyof T['columns']]?: Parts<T['columns'][K]> extends [string, infer P, infer D, unknown]
    ? RefinableParamsOf<ValueOf<P, D>>
    : never;
};

// A `$type` override is what holds the value, so the refinement merges into it.
type RefinedColumn<C, Params> =
  Parts<C> extends [infer Fn extends string, infer P, infer D, infer B extends string]
    ? P extends {$type: [infer Override]}
      ? Column<
          Fn,
          Merge<P, {$type: [MergeFormat<Override, Params>]}>,
          D,
          B & ('notNull' | 'hasDefault' | 'primaryKeyHasDefault' | 'autoincrement')
        >
      : Column<Fn, P, MergeFormat<D, Params>, B & ('notNull' | 'hasDefault' | 'primaryKeyHasDefault' | 'autoincrement')>
    : never;
type RefineCols<Cols, R> = {
  [K in keyof Cols]: K extends keyof R ? (R[K] extends object ? RefinedColumn<Cols[K], R[K]> : Cols[K]) : Cols[K];
};

/** The same table retyped: `RefinedTable<UsersTable, {name: {maxLength: 50}}>`. */
export type RefinedTable<T extends AnyTable, R extends TableRefinements<T>> = Omit<T, 'columns'> & {
  columns: RefineCols<T['columns'], R>;
};

/** Tighten a table's column types for the API; identity at run time, so the materialized table is shared. */
export function refineTableType<T extends AnyTable, const R extends TableRefinements<T>>(
  table: T,
  refinements: R
): RefinedTable<T, R> {
  void refinements;
  return table as unknown as RefinedTable<T, R>;
}
