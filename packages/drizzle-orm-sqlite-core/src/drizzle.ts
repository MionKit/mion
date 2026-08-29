/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The ONE module of @mionjs/drizzle-orm-sqlite-core that imports drizzle-orm.
// toDrizzle materializes a slim table by traversing the recorded graph, and
// types the result by SYNTHESIZING structural SQLiteColumn configs from the
// slim state (see the pg twin for the full rationale; the type-budget slim
// lane pins the approach). The materialized table works with every sqlite
// driver drizzle supports, D1 and durable-sqlite included.

import * as dzSqlite from 'drizzle-orm/sqlite-core';
import {sql as dzSql} from 'drizzle-orm';
import type {SQLiteColumn, SQLiteTableWithColumns} from 'drizzle-orm/sqlite-core';
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
import type {TableFromTypeOptions} from '@mionjs/drizzle-orm';
import {materializeRtTable, RtValueRecorder, rtTableKey, rtValueKey} from '@mionjs/drizzle-orm';
import type {InjectRunTypeId} from '@ts-runtypes/core';
import {tableFromType} from './table.ts';

const context: DrizzleContext = {
  ns: dzSqlite as unknown as DrizzleContext['ns'],
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
export type ToDrizzleTable<T extends AnyRtTable> = SQLiteTableWithColumns<{
  name: TableNameOf<T>;
  schema: undefined;
  dialect: 'sqlite';
  columns: {
    [K in keyof ColsOf<T> & string]: SQLiteColumn<
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

export function toDrizzle<T extends AnyRtTable>(table: T): ToDrizzleTable<T>;
export function toDrizzle<T extends AnyRtTable>(options?: TableFromTypeOptions<T>, id?: InjectRunTypeId<T>): ToDrizzleTable<T>;
export function toDrizzle(value?: object, id?: unknown): unknown {
  if (value !== undefined) {
    const attached = (value as Record<symbol, unknown>)[rtValueKey];
    if (attached instanceof RtValueRecorder) return attached.toDrizzleValue(context);
    if ((value as Record<symbol, unknown>)[rtTableKey] !== undefined) return materializeRtTable(value, context);
    if (id === undefined && !isTableOptions(value)) {
      throw new Error(
        '@mionjs/drizzle-orm-sqlite-core: toDrizzle() takes a slim table or the marker form toDrizzle<NotesTable>(options?)'
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
