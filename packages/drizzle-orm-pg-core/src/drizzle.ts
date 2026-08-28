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
import type {PgColumn, PgTableWithColumns} from 'drizzle-orm/pg-core';
import type {
  AnyRtTable,
  ColDataOf,
  ColHasDefaultOf,
  ColInsertExcludedOf,
  ColNotNullOf,
  ColsOf,
  DrizzleContext,
  TableNameOf,
} from '@mionjs/drizzle-orm';
import {buildRtTableFromGraph, materializeRtTable, RtValueRecorder, rtTableKey, rtValueKey} from '@mionjs/drizzle-orm';
import type {ReflectedNode} from '@mionjs/drizzle-orm';
import type {RunType} from '@ts-runtypes/core';
import type {PgEnum} from './helpers.ts';
import {pgBuildTable, type PgSchema, type PgSequence} from './table.ts';

const context: DrizzleContext = {
  ns: dzPg as unknown as DrizzleContext['ns'],
  sqlNs: dzSql as unknown as DrizzleContext['sqlNs'],
};

/** Structural PgColumn config from slim state. dataType/columnType are fixed:
 *  nothing in drizzle's model or query typing branches on them. */
type SynthConfig<K extends string, TName extends string, Data, N extends boolean, H extends boolean, X extends boolean> = {
  name: K;
  tableName: TName;
  dataType: 'custom';
  columnType: 'RtColumn';
  data: Data;
  driverParam: unknown;
  enumValues: undefined;
  notNull: N;
  hasDefault: H;
  isPrimaryKey: false;
  isAutoincrement: false;
  hasRuntimeDefault: false;
  identity: undefined;
  generated: X extends true ? {type: 'always'} : undefined;
};

/** The drizzle-typed view of a slim table: what db.select/insert/update infer
 *  from. Evaluated lazily, only where toDrizzle is actually used. */
export type ToDrizzleTable<T extends AnyRtTable> = PgTableWithColumns<{
  name: TableNameOf<T>;
  schema: undefined;
  dialect: 'pg';
  columns: {
    [K in keyof ColsOf<T> & string]: PgColumn<
      SynthConfig<
        K,
        TableNameOf<T>,
        ColDataOf<ColsOf<T>[K]>,
        ColNotNullOf<ColsOf<T>[K]>,
        ColHasDefaultOf<ColsOf<T>[K]>,
        ColInsertExcludedOf<ColsOf<T>[K]>
      >
    >;
  };
}>;

/** Materialize a slim table into the real drizzle table (memoized: every call
 *  returns the same object), or a recorded pgEnum / pgSchema / pgSequence
 *  handle into its drizzle counterpart (export those from a drizzle-kit schema
 *  file alongside the tables). */
export function toDrizzle<T extends AnyRtTable>(table: T): ToDrizzleTable<T>;
export function toDrizzle<T extends readonly [string, ...string[]]>(handle: PgEnum<T>): dzPg.PgEnum<[T[0], ...string[]]>;
export function toDrizzle(handle: PgSchema): dzPg.PgSchema;
export function toDrizzle(handle: PgSequence): dzPg.PgSequence;
export function toDrizzle(value: object): unknown {
  const attached = (value as Record<symbol, unknown>)[rtValueKey];
  if (attached instanceof RtValueRecorder) return attached.toDrizzleValue(context);
  if ((value as Record<symbol, unknown>)[rtTableKey] === undefined) {
    throw new Error('@mionjs/drizzle-orm-pg-core: toDrizzle() takes a slim table or a pgEnum/pgSchema/pgSequence handle');
  }
  return materializeRtTable(value, context);
}

// Rebuilt slim tables, one per reflected table id (so repeated calls share the
// materialized drizzle table exactly like the builder road memoizes).
const fromTypeTables = new Map<string, object>();

/** Materialize a TYPE-defined table (PgTable<'users', {...}>) into the same
 *  drizzle table its builder twin produces. Resolve the graph at the call
 *  site: `tableFromType(getRunType<UsersTable>())`. Memoized per type id. */
export function tableFromType<T extends AnyRtTable>(runType: RunType<T>): ToDrizzleTable<T> {
  let slimTable = fromTypeTables.get(runType.id);
  if (slimTable === undefined) {
    slimTable = buildRtTableFromGraph(runType as ReflectedNode, pgBuildTable);
    fromTypeTables.set(runType.id, slimTable);
  }
  return materializeRtTable(slimTable, context) as ToDrizzleTable<T>;
}
