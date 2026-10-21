/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Flat models with drizzle's operations.d.ts semantics, every flag derived from the column's raw props.

import type {AnyTable, InsertKind, SelectValue} from './types.ts';
import {rtColSpecKey} from './columns.ts';

type Prettify<T> = {[K in keyof T]: T[K]} & {};

// The spec parts are inferred straight off the column, one conditional per column and model.
type Sel<C> = C extends {readonly [rtColSpecKey]?: {config: infer P; data: infer D; base: infer B}}
  ? SelectValue<P, D, B>
  : never;
type Ins<C> = C extends {readonly [rtColSpecKey]?: {config: infer P; base: infer B}} ? InsertKind<P, B> : never;

type SelectOfCols<C> = {[K in keyof C]: Sel<C[K]>};
type InsertOfCols<C> = {[K in keyof C as Ins<C[K]> extends 'required' ? K : never]: Sel<C[K]>} & {
  [K in keyof C as Ins<C[K]> extends 'optional' ? K : never]?: Sel<C[K]>;
};

/** Row model of a set of columns: every column, nullable ones as `| null`. */
export type SelectModelOf<Cols> = Prettify<SelectOfCols<Cols>>;
/** Insert payload of a set of columns: generated columns removed, defaulted and nullable ones optional. */
export type InsertModelOf<Cols> = Prettify<InsertOfCols<Cols>>;

/** Row model: every column, nullable ones as `| null`. */
export type InferSelectModel<T extends AnyTable> = SelectModelOf<T['columns']>;
/** Row model of a view. */
export type InferSelectViewModel<V extends {columns: object}> = SelectModelOf<V['columns']>;
/** Insert payload: generated columns removed, defaulted and nullable ones optional. */
export type InferInsertModel<T extends AnyTable> = InsertModelOf<T['columns']>;

// Type only, nothing holds these at run time. Kept off the core meta so checking against AnyTable never builds models.
/** drizzle's `typeof users.$inferSelect` / `$inferInsert` on a slim table: the same types as the Infer*Model ones. */
export interface RtTableInfer<Cols> {
  readonly $inferSelect: SelectModelOf<Cols>;
  readonly $inferInsert: InsertModelOf<Cols>;
}
/** drizzle's `typeof view.$inferSelect` on a slim view. */
export interface RtViewInfer<Cols> {
  readonly $inferSelect: SelectModelOf<Cols>;
}
