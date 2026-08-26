/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getTableColumns} from 'drizzle-orm';
import type {Column, InferInsertModel, InferSelectModel, Table} from 'drizzle-orm';
import {createMockDataFn, getRTFunction, getRunType, getRunTypeId, runTypeErrorsToIssues} from '@ts-runtypes/core';
import type {
  GetValidationErrorsFn,
  InjectRunTypeId,
  InjectTypeFnArgs,
  RTValidationError,
  RTValidationErrorPathSegment,
  StandardSchemaProps,
  ValidateFn,
} from '@ts-runtypes/core';
import {TypedError} from '@mionjs/core';
import {buildColumnGuards, refineError, stringLengthLimits} from './columnGuards.ts';
import type {ColumnRefineFn, DrizzleEnumSchema, DrizzleRefine, DrizzleRunTypeSchema, InferUpdateModel} from './schema.types.ts';

// ⚠️ The markers in the factory signatures MUST be spelled INLINE as
// InjectTypeFnArgs<Model, 'val', 'verr', 'huk', 'uke'> — a local type alias over the
// marker is NOT recognized by the ts-runtypes scanner (same rule as mion's route()).

/** Schema for a full row as returned by a select. */
export function createSelectSchema<TTable extends Table>(
  table: TTable,
  refine?: DrizzleRefine<InferSelectModel<TTable>>,
  fns?: InjectTypeFnArgs<InferSelectModel<TTable>, 'val', 'verr', 'huk', 'uke'>,
  id?: InjectRunTypeId<InferSelectModel<TTable>>
): DrizzleRunTypeSchema<InferSelectModel<TTable>> {
  return buildTableSchema<InferSelectModel<TTable>>('createSelectSchema', table, refine, fns, id);
}

/** Schema for an insert payload: required iff notNull without a default, generated columns absent. */
export function createInsertSchema<TTable extends Table>(
  table: TTable,
  refine?: DrizzleRefine<InferInsertModel<TTable>>,
  fns?: InjectTypeFnArgs<InferInsertModel<TTable>, 'val', 'verr', 'huk', 'uke'>,
  id?: InjectRunTypeId<InferInsertModel<TTable>>
): DrizzleRunTypeSchema<InferInsertModel<TTable>> {
  return buildTableSchema<InferInsertModel<TTable>>('createInsertSchema', table, refine, fns, id);
}

/** Schema for an update payload: any subset of the insert payload. */
export function createUpdateSchema<TTable extends Table>(
  table: TTable,
  refine?: DrizzleRefine<InferUpdateModel<TTable>>,
  fns?: InjectTypeFnArgs<InferUpdateModel<TTable>, 'val', 'verr', 'huk', 'uke'>,
  id?: InjectRunTypeId<InferUpdateModel<TTable>>
): DrizzleRunTypeSchema<InferUpdateModel<TTable>> {
  return buildTableSchema<InferUpdateModel<TTable>>('createUpdateSchema', table, refine, fns, id);
}

/** Schema for a database enum's value union (e.g. a pgEnum). */
export function createEnumSchema<TEnum extends {enumValues: readonly [string, ...string[]]}>(
  enumObj: TEnum,
  fns?: InjectTypeFnArgs<TEnum['enumValues'][number], 'val', 'verr'>,
  id?: InjectRunTypeId<TEnum['enumValues'][number]>
): DrizzleEnumSchema<TEnum['enumValues'][number]> {
  type Value = TEnum['enumValues'][number];
  const injected = requireInjected('createEnumSchema', fns, 2);
  if (id === undefined) throw missingFnsError('createEnumSchema');
  const validate = getRTFunction<'val'>(injected[0]) as ValidateFn<Value>;
  const getErrors = getRTFunction<'verr'>(injected[1]);
  const typeId = getRunTypeId<Value>(undefined, id as InjectRunTypeId<Value>);
  return {
    validate,
    getErrors,
    mock: createMockDataFn<Value>(undefined, undefined, id as InjectRunTypeId<Value>),
    runType: getRunType<Value>(undefined, id as InjectRunTypeId<Value>),
    typeId,
    '~standard': buildStandardProps<Value>(validate as (value: unknown) => boolean, getErrors),
  };
}

// ############# internals #############

function missingFnsError(label: string): TypedError {
  return new TypedError({
    type: 'drizzle-schema-missing-fns',
    message:
      `${label} requires compiled type functions injected at build time: ` +
      `the @ts-runtypes/devtools vite plugin (via @mionjs/devtools mionVitePlugin) must be active.`,
  });
}

/** FAIL CLOSED: a missing or short payload means the plugin was inactive or version-skewed;
 *  falling back would silently disable validation. */
function requireInjected(label: string, fns: unknown, count: number): readonly unknown[] {
  if (!Array.isArray(fns)) throw missingFnsError(label);
  const injected = fns as readonly unknown[];
  for (let i = 0; i < count; i++) {
    if (injected[i] === undefined) throw missingFnsError(label);
  }
  return injected;
}

function buildStandardProps<T>(
  validate: (value: unknown) => boolean,
  getErrors: GetValidationErrorsFn
): StandardSchemaProps<T, T> {
  return {
    version: 1,
    vendor: 'mion-drizzle',
    validate(value: unknown) {
      if (validate(value)) return {value: value as T};
      return {issues: runTypeErrorsToIssues(getErrors(value))};
    },
  };
}

function buildTableSchema<T>(
  label: string,
  table: Table,
  refine: DrizzleRefine<T> | undefined,
  fns: unknown,
  id: unknown
): DrizzleRunTypeSchema<T> {
  const injected = requireInjected(label, fns, 4);
  if (id === undefined) throw missingFnsError(label);
  const idHandle = id as InjectRunTypeId<T>;
  const baseValidate = getRTFunction<'val'>(injected[0]) as (value: unknown) => boolean;
  const baseGetErrors = getRTFunction<'verr'>(injected[1]);
  const hasUnknownKeys = getRTFunction<'huk'>(injected[2]);
  const unknownKeyErrors = getRTFunction<'uke'>(injected[3]);
  const columns = getTableColumns(table) as Record<string, Column>;
  const guards = buildColumnGuards(columns);
  const lengthLimits = stringLengthLimits(columns);
  const refineEntries = Object.entries(refine ?? {}) as [string, ColumnRefineFn<unknown> | undefined][];

  // mock rows must satisfy the schema's OWN validate, length guards included: the walker
  // has no varchar-length knowledge, so string cells are clamped to their column length.
  // Refinements are user predicates the mock cannot know; mock() ignores them on purpose.
  const rawMock = createMockDataFn<T>(undefined, undefined, idHandle);
  const mock: typeof rawMock = (options) => {
    const row = rawMock(options);
    if (row && typeof row === 'object') {
      for (const [key, maxLength] of lengthLimits) {
        const cell = (row as Record<string, unknown>)[key];
        if (typeof cell === 'string' && cell.length > maxLength) {
          (row as Record<string, unknown>)[key] = cell.slice(0, maxLength);
        }
      }
    }
    return row;
  };

  // guards + refine run per column on the row object, skipping null/undefined values
  // (nullability/optionality is the compiled validator's job)
  const extraErrors = (value: unknown, path: RTValidationErrorPathSegment[], errors: RTValidationError[]): void => {
    if (typeof value !== 'object' || value === null) return;
    const row = value as Record<string, unknown>;
    for (const guard of guards) {
      const cell = row[guard.key];
      if (cell === null || cell === undefined) continue;
      const error = guard.check(cell);
      if (error) errors.push({...error, path: [...path, ...error.path]});
    }
    for (const [key, refineFn] of refineEntries) {
      if (!refineFn) continue;
      const cell = row[key];
      if (cell === null || cell === undefined) continue;
      const result = refineFn(cell);
      if (result === true) continue;
      errors.push({...refineError(key, typeof result === 'string' ? result : undefined), path: [...path, key]});
    }
  };

  const validate = ((value: unknown): boolean => {
    if (!baseValidate(value)) return false;
    const errors: RTValidationError[] = [];
    extraErrors(value, [], errors);
    return errors.length === 0;
  }) as ValidateFn<T>;

  const getErrors: GetValidationErrorsFn = (value, path = [], errors = []) => {
    baseGetErrors(value, path, errors);
    extraErrors(value, path, errors);
    return errors;
  };

  return {
    validate,
    getErrors,
    hasUnknownKeys,
    unknownKeyErrors,
    mock,
    runType: getRunType<T>(undefined, idHandle),
    typeId: getRunTypeId<T>(undefined, idHandle),
    '~standard': buildStandardProps<T>(validate as (value: unknown) => boolean, getErrors),
  };
}
