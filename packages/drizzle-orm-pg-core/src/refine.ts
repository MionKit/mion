/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Type-level table refinement + model derivation for @mionjs/drizzle-orm-pg-core.
// refineTable is the package's ONE runtime export beyond the proxy builders, and
// it is identity: the SAME table object comes back retyped with the refinement
// params merged into each column's captured format params. Everything else here
// is types: InferSelect/InferInsert/InferUpdate derive the model TYPES, and all
// compiled functions come from the standard runtypes generic API over them
// (createValidateFn<Model>(), createMockDataFn<Model>(), ...).
//
// This file is byte-identical across the three dialect packages modulo the
// dialect tokens (import specifiers + table/column type names); the parity spec
// in the pg package pins that.

import type {InferInsertModel, InferSelectModel} from 'drizzle-orm';
import type {ColumnBaseConfig} from 'drizzle-orm';
import type {ColumnDataType} from 'drizzle-orm/column-builder';
import type {Assume, Update} from 'drizzle-orm/utils';
import type {PgColumn, PgTable, PgTableWithColumns} from 'drizzle-orm/pg-core';
import type {FormatNameOf, FormatParamsOf, TypeFormat, TypeFormatBase} from '@ts-runtypes/core';
import type {
  BigIntParams,
  DateParams,
  DateTimeParams,
  IPParams,
  NativeDateParams,
  NumberParams,
  StringParams,
  TimeParams,
} from '@ts-runtypes/core/formats';

// The standard model utilities live in @ts-runtypes/core; re-exported so
// consumers get the whole model vocabulary from this one package.
export type {InsertModel, SelectModel, UpdateModel} from '@ts-runtypes/core';
import type {UpdateModel} from '@ts-runtypes/core';

type Prettify<T> = {[K in keyof T]: T[K]} & {};
type Mutable<T> = {-readonly [K in keyof T]: T[K]};

// Format family -> the params a refinement may add for that family. A column
// whose data carries no family (passthrough boolean/json/enum/skipped) or a
// family missing here refines to `never`, so ANY refinement on it is a
// compile error - never a drizzle-zod-style silent bypass.
interface RefinableParamsByFamily {
  stringFormat: Partial<StringParams>;
  numberFormat: Partial<NumberParams>;
  bigintFormat: Partial<BigIntParams>;
  nativeDate: Partial<NativeDateParams>;
  date: Partial<DateParams>;
  time: Partial<TimeParams>;
  dateTime: Partial<DateTimeParams>;
  ip: Partial<IPParams>;
}

type ColumnRefinement<Data> =
  FormatNameOf<Data> extends keyof RefinableParamsByFamily ? RefinableParamsByFamily[FormatNameOf<Data>] : never;

/** Per-column refinement params accepted for table T (only format-carrying columns). */
export type TableRefinements<T extends PgTable> = {
  [K in keyof T['_']['columns']]?: ColumnRefinement<T['_']['columns'][K]['_']['data']>;
};

// Rebuild the column's data slot with the refinement params MERGED into the
// captured format params (refinement wins on a shared key). Base + family are
// preserved, so nullability/insert-optionality (notNull/hasDefault on the
// column config, untouched) and the value type cannot change.
type MergeFormat<Data, R> = TypeFormat<
  Extract<
    Data extends string
      ? string
      : Data extends number
        ? number
        : Data extends bigint
          ? bigint
          : Data extends globalThis.Date
            ? globalThis.Date
            : never,
    TypeFormatBase
  >,
  FormatNameOf<Data>,
  Prettify<Omit<FormatParamsOf<Data>, keyof Mutable<R>> & Mutable<R>>
>;

type RefineColumn<Col, R> =
  Col extends PgColumn<infer Config, infer RuntimeConfig, infer TypeConfig>
    ? PgColumn<
        Assume<Update<Config, {data: MergeFormat<Config['data'], R>}>, ColumnBaseConfig<ColumnDataType, string>>,
        RuntimeConfig,
        TypeConfig
      >
    : Col;

type RefineColumns<Cols, R> = {
  [K in keyof Cols]: K extends keyof R ? (R[K] extends object ? RefineColumn<Cols[K], R[K]> : Cols[K]) : Cols[K];
};

/** The same table retyped: refined columns carry the merged format params. */
export type RefinedTable<T extends PgTable, R> =
  T extends PgTable<infer Config>
    ? PgTableWithColumns<{
        name: Config['name'];
        schema: Config['schema'];
        dialect: Config['dialect'];
        columns: Assume<RefineColumns<Config['columns'], R>, Record<string, PgColumn>>;
      }>
    : never;

/** Tighten a table's column types for the API (stricter than the database):
 *  plain per-column format params, merged into the captured ones. Identity at
 *  runtime - returns the SAME table object retyped and never touches drizzle's
 *  runtime column config or SQL. */
export function refineTable<T extends PgTable, const R extends TableRefinements<T>>(
  table: T,
  refinements: R
): RefinedTable<T, R> {
  void refinements;
  return table as unknown as RefinedTable<T, R>;
}

/** Row model of a (refined) table: drizzle's InferSelectModel under one roof. */
export type InferSelect<T extends PgTable> = InferSelectModel<T>;
/** Insert payload of a (refined) table: generated columns removed, defaulted optional. */
export type InferInsert<T extends PgTable> = InferInsertModel<T>;
/** Update payload of a (refined) table: any subset of the insert payload. */
export type InferUpdate<T extends PgTable> = UpdateModel<InferInsertModel<T>>;
