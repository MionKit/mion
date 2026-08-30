/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The ONE module of @mionjs/drizzle-orm-mysql-core that imports drizzle-orm.
// toDrizzle materializes a slim table (or a recorded mysqlSchema handle) by
// traversing the recorded graph, and types the result by SYNTHESIZING
// structural MySqlColumn configs from the slim state (see the pg twin for the
// full rationale; the type-budget slim lane pins the approach).

import * as dzMy from 'drizzle-orm/mysql-core';
import {sql as dzSql} from 'drizzle-orm';
import type {MySqlColumn, MySqlTableWithColumns, MySqlViewWithSelection} from 'drizzle-orm/mysql-core';
import type {
  AnyRtTable,
  AnyRtView,
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
  RtEntryRecorder,
  materializeRtView,
  materializeRtTable,
  RtValueRecorder,
  rtTableKey,
  rtValueKey,
} from '@mionjs/drizzle-orm';
import type {InjectRunTypeId} from '@ts-runtypes/core';
import type {RtMyIndexEntry} from './helpers.ts';
import {tableFromType, type MySqlSchema} from './table.ts';

const context: DrizzleContext = {
  ns: dzMy as unknown as DrizzleContext['ns'],
  sqlNs: dzSql as unknown as DrizzleContext['sqlNs'],
};

// isPrimaryKey / isAutoincrement / hasRuntimeDefault are NOT decorative here:
// drizzle's `$returningId()` returns exactly the keys where isPrimaryKey is
// true and one of the other two is, so hardcoding them made `$returningId()`
// on a materialized table infer `{}` instead of `{id: number}`.
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
      isPrimaryKey: Key['primaryKey'];
      isAutoincrement: Key['autoincrement'];
      hasRuntimeDefault: Key['runtimeDefault'];
      identity: undefined;
      generated: X extends true ? {type: 'always'} : undefined;
    }
  : never;

/** The drizzle-typed view of a slim table, paid lazily where queries live. */
export type ToDrizzleTable<T extends AnyRtTable> = MySqlTableWithColumns<{
  name: TableNameOf<T>;
  schema: undefined;
  dialect: 'mysql';
  columns: {
    [K in keyof ColsOf<T> & string]: MySqlColumn<
      SynthConfig<K, TableNameOf<T>, ColBrandOf<ColsOf<T>[K]>, ColKeyFlagsOf<ColsOf<T>[K]>>
    >;
  };
}>;

/** The drizzle-typed view of a slim VIEW. Same synthesis as ToDrizzleTable;
 *  TExisting stays `boolean` because nothing in select typing branches on it
 *  and pinning it would cost a type parameter on every declared view. */
export type ToDrizzleView<V extends AnyRtView> = MySqlViewWithSelection<
  ViewNameOf<V>,
  boolean,
  {
    [K in keyof ViewColsOf<V> & string]: MySqlColumn<
      SynthConfig<K, ViewNameOf<V>, ColBrandOf<ViewColsOf<V>[K]>, ColKeyFlagsOf<ViewColsOf<V>[K]>>
    >;
  }
>;

export function toDrizzle<T extends AnyRtTable>(table: T): ToDrizzleTable<T>;
export function toDrizzle<V extends AnyRtView>(view: V): ToDrizzleView<V>;
export function toDrizzle(handle: MySqlSchema): dzMy.MySqlSchema;
// An INDEX declared outside any table's extraConfig. drizzle's query side takes
// its own IndexBuilder (dzMy.IndexBuilder) for a hint, and the table's replay
// takes the recorder, so a schema that does both declares the index once and
// materializes it here for the query half.
export function toDrizzle(entry: RtMyIndexEntry): dzMy.IndexBuilder;
export function toDrizzle<T extends AnyRtTable>(options?: TableFromTypeOptions<T>, id?: InjectRunTypeId<T>): ToDrizzleTable<T>;
export function toDrizzle(value?: object, id?: unknown): unknown {
  if (value !== undefined) {
    const attached = (value as Record<symbol, unknown>)[rtValueKey];
    if (attached instanceof RtValueRecorder) return attached.toDrizzleValue(context);
    // A standalone ENTRY — an index or a constraint declared outside any
    // table's extraConfig. drizzle's query side takes one directly
    // (`.useIndex(idx)` wants its own IndexBuilder), so the entry has to be
    // materializable on its own, exactly as a table is.
    if (value instanceof RtEntryRecorder) return value.toDrizzleEntry(context);
    if (isRtView(value)) return materializeRtView(value, context);
    if ((value as Record<symbol, unknown>)[rtTableKey] !== undefined) return materializeRtTable(value, context);
    if (id === undefined && !isTableOptions(value)) {
      throw new Error(
        '@mionjs/drizzle-orm-mysql-core: toDrizzle() takes a slim table, a mysqlSchema handle, ' +
          'or the marker form toDrizzle<UsersTable>(options?)'
      );
    }
  }
  const slim = tableFromType(value as TableFromTypeOptions | undefined, id as InjectRunTypeId<AnyRtTable> | undefined);
  return materializeRtTable(slim, context);
}

/** A non-table object arg is only valid as the marker form's options bag. */
function isTableOptions(value: object): boolean {
  return Object.keys(value).every((key) => key === 'tables' || key === 'runtime');
}
