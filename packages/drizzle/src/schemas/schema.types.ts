/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {
  GetValidationErrorsFn,
  HasUnknownKeysFn,
  MockTypeFn,
  RunType,
  StandardSchemaProps,
  UnknownKeyErrorsFn,
  ValidateFn,
} from '@ts-runtypes/core';
import type {InferInsertModel, Table} from 'drizzle-orm';

/** Update model: drizzle ships no InferUpdateModel; an update payload is any subset of the insert payload. */
export type InferUpdateModel<TTable extends Table> = Partial<InferInsertModel<TTable>>;

/** Per-column refinement. Runs AFTER the compiled validator passed, skipped on null/undefined.
 *  Return false to fail with a generic refine error, or a string to fail with that message. */
export type ColumnRefineFn<V> = (value: NonNullable<V>) => boolean | string;

/** Column-keyed refinement map for a schema factory. */
export type DrizzleRefine<TModel> = {[K in keyof TModel]?: ColumnRefineFn<TModel[K]>};

/** Validation schema derived from a drizzle table: compiled ts-runtypes validators plus
 *  column guards (metadata only the table knows, e.g. varchar length) and user refinements. */
export interface DrizzleRunTypeSchema<T> {
  /** Boolean validator: compiled base validator + column guards + refine. */
  validate: ValidateFn<T>;
  /** Error collector: compiled base errors + appended guard/refine entries. */
  getErrors: GetValidationErrorsFn;
  /** True when the value carries keys not present in the model (e.g. generated columns in an insert payload). */
  hasUnknownKeys: HasUnknownKeysFn;
  /** Error entries for unknown keys. */
  unknownKeyErrors: UnknownKeyErrorsFn;
  /** Mock row generator over the model's reflection graph. */
  mock: MockTypeFn<T>;
  /** The model's traversable reflection node. */
  runType: RunType<T>;
  /** Stable structural type id of the model. */
  typeId: string;
  /** Standard Schema v1 interop surface (validate wraps guards + refine too). */
  '~standard': StandardSchemaProps<T, T>;
}

/** Schema for a database enum's value union (no row-level fns, no table metadata). */
export type DrizzleEnumSchema<T> = Omit<DrizzleRunTypeSchema<T>, 'hasUnknownKeys' | 'unknownKeyErrors'>;
