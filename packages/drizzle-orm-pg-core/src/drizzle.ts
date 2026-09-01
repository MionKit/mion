/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The ONE module of @mionjs/drizzle-orm-pg-core that imports drizzle-orm
// (which is why drizzle-orm can be an optional peer: a project that never
// calls toDrizzle never loads it). toDrizzle materializes a slim table (or a
// recorded enum/schema/sequence handle) into the real drizzle object by
// traversing the recorded graph, and types the result by SYNTHESIZING
// structural PgColumn configs from the slim state — drizzle's model and query
// typing reads only data / notNull / hasDefault / generated / identity, so a
// fixed dataType/columnType satisfies it (pinned by the type-budget slim lane
// and its shape pins). The drizzle generics are paid here, lazily, and only in
// the files that run queries.

import * as dzPg from 'drizzle-orm/pg-core';
import {sql as dzSql} from 'drizzle-orm';
import type {PgColumn, PgTableWithColumns, PgViewWithSelection} from 'drizzle-orm/pg-core';
import type {
  ColBrandOf,
  PlainDataOf,
  ColKeyFlags,
  ColKeyFlagsOf,
  ColsOf,
  DrizzleContext,
  TableNameOf,
  ViewColsOf,
  ViewNameOf,
} from '@mionjs/drizzle-orm';
import type {TableFromTypeOptions} from '@mionjs/drizzle-orm';
import {
  isRtView,
  materializeRtTable,
  materializeRtView,
  RtEntryRecorder,
  RtValueRecorder,
  rtTableKey,
  rtValueKey,
} from '@mionjs/drizzle-orm';
import type {InjectRunTypeId} from '@mionjs/run-types';
import type {PgEnum, PgEnumObject, PgRole, RtLinkedPolicy, RtPolicyEntry, RtIndexEntry} from './helpers.ts';
import type {AnyPgTable, AnyPgView} from './table.ts';
import {tableFromType, type PgSchema, type PgSequence} from './table.ts';

const context: DrizzleContext = {
  ns: dzPg as unknown as DrizzleContext['ns'],
  sqlNs: dzSql as unknown as DrizzleContext['sqlNs'],
};

/** Structural PgColumn config from slim state. dataType/columnType are fixed:
 *  nothing in drizzle's model or query typing branches on them. */
// `identity` is NOT decorative: drizzle leaves an `identity: 'always'` column
// out of an insert and lets `.overridingSystemValue()` put it back, while a
// `generated` one stays out either way. Reporting the identity column as
// generated made `.overridingSystemValue()` accept nothing.
// isPrimaryKey / isAutoincrement / hasRuntimeDefault stay fixed here: only
// mysql's `$returningId()` reads them, and its twin synthesizes them.
type SynthConfig<K extends string, TName extends string, Brand, Key extends ColKeyFlags> = Brand extends {
  data: infer Data;
  notNull: infer N extends boolean;
  hasDefault: infer H extends boolean;
  insertExcluded: infer X extends boolean;
}
  ? {
      name: K;
      tableName: TName;
      dataType: 'custom';
      columnType: 'RtColumn';
      data: PlainDataOf<Data>;
      driverParam: unknown;
      enumValues: undefined;
      notNull: N;
      hasDefault: H;
      isPrimaryKey: false;
      isAutoincrement: false;
      hasRuntimeDefault: false;
      identity: Key['identity'];
      generated: X extends true ? ([Key['identity']] extends [undefined] ? {type: 'always'} : undefined) : undefined;
    }
  : never;

/** The drizzle-typed view of a slim table: what db.select/insert/update infer
 *  from. Evaluated lazily, only where toDrizzle is actually used. */
export type ToDrizzleTable<T extends AnyPgTable> = PgTableWithColumns<{
  name: TableNameOf<T>;
  schema: undefined;
  dialect: 'pg';
  columns: {
    [K in keyof ColsOf<T> & string]: PgColumn<
      SynthConfig<K, TableNameOf<T>, ColBrandOf<ColsOf<T>[K]>, ColKeyFlagsOf<ColsOf<T>[K]>>
    >;
  };
}>;

/** The drizzle-typed view of a slim VIEW. Same synthesis as ToDrizzleTable;
 *  TExisting stays `boolean` because nothing in select typing branches on it
 *  and pinning it would cost a type parameter on every declared view. */
export type ToDrizzleView<V extends AnyPgView> = PgViewWithSelection<
  ViewNameOf<V>,
  boolean,
  {
    [K in keyof ViewColsOf<V> & string]: PgColumn<
      SynthConfig<K, ViewNameOf<V>, ColBrandOf<ViewColsOf<V>[K]>, ColKeyFlagsOf<ViewColsOf<V>[K]>>
    >;
  }
>;

/** Materialize a slim table into the real drizzle table (memoized: every call
 *  returns the same object), or a recorded pgEnum / pgSchema / pgSequence
 *  handle into its drizzle counterpart (export those from a drizzle-kit schema
 *  file alongside the tables). The marker form `toDrizzle<UsersTable>(options?)`
 *  is the type road's happy path: it resolves the table type itself
 *  (@mionjs/devtools must be active) and shares tableFromType's per-type
 *  slim table. */
export function toDrizzle<T extends AnyPgTable>(table: T): ToDrizzleTable<T>;
export function toDrizzle<V extends AnyPgView>(view: V): ToDrizzleView<V>;
export function toDrizzle<T extends readonly [string, ...string[]]>(handle: PgEnum<T>): dzPg.PgEnum<[T[0], ...string[]]>;
export function toDrizzle<E extends Record<string, string>>(handle: PgEnumObject<E>): dzPg.PgEnumObject<E>;
export function toDrizzle(handle: PgSchema): dzPg.PgSchema;
export function toDrizzle(handle: PgSequence): dzPg.PgSequence;
export function toDrizzle(handle: PgRole): dzPg.PgRole;
export function toDrizzle(handle: RtLinkedPolicy): dzPg.PgPolicy;
// An UNLINKED policy materializes on its own too: it is a standalone drizzle
// value, and drizzle-kit reads it from wherever you export it. The runtime
// always handled it; only the overload was missing, so `toDrizzle(pgPolicy(…))`
// did not typecheck.
export function toDrizzle(handle: RtPolicyEntry): dzPg.PgPolicy;
// An INDEX declared outside any table's extraConfig. drizzle's query side takes
// its own IndexBuilder (dzPg.IndexBuilder) for a hint, and the table's replay
// takes the recorder, so a schema that does both declares the index once and
// materializes it here for the query half.
export function toDrizzle(entry: RtIndexEntry): dzPg.IndexBuilder;
export function toDrizzle<T extends AnyPgTable>(options?: TableFromTypeOptions<T>, id?: InjectRunTypeId<T>): ToDrizzleTable<T>;
export function toDrizzle(value?: object, id?: unknown): unknown {
  if (value !== undefined) {
    const attached = (value as Record<symbol, unknown>)[rtValueKey];
    if (attached instanceof RtValueRecorder) return attached.toDrizzleValue(context);
    // A policy linked to a table declared elsewhere: it belongs to no
    // extraConfig, so it materializes on its own.
    if (value instanceof RtEntryRecorder) return value.toDrizzleEntry(context);
    if (isRtView(value)) return materializeRtView(value, context);
    if ((value as Record<symbol, unknown>)[rtTableKey] !== undefined) return materializeRtTable(value, context);
    if (id === undefined && !isTableOptions(value)) {
      throw new Error(
        '@mionjs/drizzle-orm-pg-core: toDrizzle() takes a slim table, a pgEnum/pgSchema/pgSequence/pgRole handle, ' +
          'a pgPolicy, or the marker form toDrizzle<UsersTable>(options?)'
      );
    }
  }
  const slim = tableFromType(value as TableFromTypeOptions | undefined, id as InjectRunTypeId<AnyPgTable> | undefined);
  return materializeRtTable(slim, context);
}

/** A non-table object arg is only valid as the marker form's options bag. */
function isTableOptions(value: object): boolean {
  return Object.keys(value).every((key) => key === 'tables' || key === 'runtime');
}
