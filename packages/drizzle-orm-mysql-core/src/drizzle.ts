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
  ColDataOf,
  ColHasDefaultOf,
  ColInsertExcludedOf,
  ColNotNullOf,
  ColsOf,
  DrizzleContext,
  TableNameOf,
  ViewColsOf,
  ViewNameOf,
} from '@mionjs/drizzle-orm';
import type {TableFromTypeOptions} from '@mionjs/drizzle-orm';
import {isRtView, materializeRtView, materializeRtTable, RtValueRecorder, rtTableKey, rtValueKey} from '@mionjs/drizzle-orm';
import type {InjectRunTypeId} from '@ts-runtypes/core';
import {tableFromType, type MySqlSchema} from './table.ts';

const context: DrizzleContext = {
  ns: dzMy as unknown as DrizzleContext['ns'],
  sqlNs: dzSql as unknown as DrizzleContext['sqlNs'],
};

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

/** The drizzle-typed view of a slim table, paid lazily where queries live. */
export type ToDrizzleTable<T extends AnyRtTable> = MySqlTableWithColumns<{
  name: TableNameOf<T>;
  schema: undefined;
  dialect: 'mysql';
  columns: {
    [K in keyof ColsOf<T> & string]: MySqlColumn<
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

/** The drizzle-typed view of a slim VIEW. Same synthesis as ToDrizzleTable;
 *  TExisting stays `boolean` because nothing in select typing branches on it
 *  and pinning it would cost a type parameter on every declared view. */
export type ToDrizzleView<V extends AnyRtView> = MySqlViewWithSelection<
  ViewNameOf<V>,
  boolean,
  {
    [K in keyof ViewColsOf<V> & string]: MySqlColumn<
      SynthConfig<
        K,
        ViewNameOf<V>,
        ColDataOf<ViewColsOf<V>[K]>,
        ColNotNullOf<ViewColsOf<V>[K]>,
        ColHasDefaultOf<ViewColsOf<V>[K]>,
        ColInsertExcludedOf<ViewColsOf<V>[K]>
      >
    >;
  }
>;

export function toDrizzle<T extends AnyRtTable>(table: T): ToDrizzleTable<T>;
export function toDrizzle<V extends AnyRtView>(view: V): ToDrizzleView<V>;
export function toDrizzle(handle: MySqlSchema): unknown;
export function toDrizzle<T extends AnyRtTable>(options?: TableFromTypeOptions<T>, id?: InjectRunTypeId<T>): ToDrizzleTable<T>;
export function toDrizzle(value?: object, id?: unknown): unknown {
  if (value !== undefined) {
    const attached = (value as Record<symbol, unknown>)[rtValueKey];
    if (attached instanceof RtValueRecorder) return attached.toDrizzleValue(context);
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
