/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Models over the side-by-side columns: one spec read per column, every flag derived here from the
// raw props. Same semantics as ../src/models.ts, which mirrors drizzle's own operations.d.ts.

import type {InsertKind, SelectValue} from './columns.ts';
import {rtColSpecKey} from './columns.ts';
import type {AnyTable} from './table.ts';

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
type UpdateOfCols<C> = {[K in keyof C as Ins<C[K]> extends 'excluded' ? never : K]?: Sel<C[K]>};

/** Row model: every column, nullable ones as `| null`. */
export type InferSelectModel<T extends AnyTable> = Prettify<SelectOfCols<T['columns']>>;
/** Row model of a view. */
export type InferSelectViewModel<V extends {columns: object}> = Prettify<SelectOfCols<V['columns']>>;
/** Insert payload: generated columns removed, defaulted and nullable ones optional. */
export type InferInsertModel<T extends AnyTable> = Prettify<InsertOfCols<T['columns']>>;
/** Update payload: any subset of the insert payload. */
export type InferUpdateModel<T extends AnyTable> = Prettify<UpdateOfCols<T['columns']>>;
