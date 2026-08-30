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
import type {SQLiteColumn, SQLiteTableWithColumns, SQLiteViewWithSelection} from 'drizzle-orm/sqlite-core';
import type {ColBrandOf, PlainDataOf, ColsOf, DrizzleContext, TableNameOf, ViewColsOf, ViewNameOf} from '@mionjs/drizzle-orm';
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
import type {RtSqliteIndexEntry} from './helpers.ts';
import type {AnySqliteTable, AnySqliteView} from './table.ts';
import {tableFromType} from './table.ts';

const context: DrizzleContext = {
  ns: dzSqlite as unknown as DrizzleContext['ns'],
  sqlNs: dzSql as unknown as DrizzleContext['sqlNs'],
};

type SynthConfig<K extends string, TName extends string, Brand> = Brand extends {
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
      // Fixed, and only safe because THIS dialect reads none of the three: mysql's
      // `$returningId()` does, so its twin synthesizes them from the slim column.
      isPrimaryKey: false;
      isAutoincrement: false;
      hasRuntimeDefault: false;
      identity: undefined;
      generated: X extends true ? {type: 'always'} : undefined;
    }
  : never;

/** The drizzle-typed view of a slim table, paid lazily where queries live. */
export type ToDrizzleTable<T extends AnySqliteTable> = SQLiteTableWithColumns<{
  name: TableNameOf<T>;
  schema: undefined;
  dialect: 'sqlite';
  columns: {
    [K in keyof ColsOf<T> & string]: SQLiteColumn<SynthConfig<K, TableNameOf<T>, ColBrandOf<ColsOf<T>[K]>>>;
  };
}>;

/** The drizzle-typed view of a slim VIEW. Same synthesis as ToDrizzleTable;
 *  TExisting stays `boolean` because nothing in select typing branches on it
 *  and pinning it would cost a type parameter on every declared view. */
export type ToDrizzleView<V extends AnySqliteView> = SQLiteViewWithSelection<
  ViewNameOf<V>,
  boolean,
  {
    [K in keyof ViewColsOf<V> & string]: SQLiteColumn<SynthConfig<K, ViewNameOf<V>, ColBrandOf<ViewColsOf<V>[K]>>>;
  }
>;

export function toDrizzle<T extends AnySqliteTable>(table: T): ToDrizzleTable<T>;
export function toDrizzle<V extends AnySqliteView>(view: V): ToDrizzleView<V>;
// An INDEX declared outside any table's extraConfig. drizzle's query side takes
// its own IndexBuilder (dzSqlite.IndexBuilder) for a hint, and the table's replay
// takes the recorder, so a schema that does both declares the index once and
// materializes it here for the query half.
export function toDrizzle(entry: RtSqliteIndexEntry): dzSqlite.IndexBuilder;
export function toDrizzle<T extends AnySqliteTable>(
  options?: TableFromTypeOptions<T>,
  id?: InjectRunTypeId<T>
): ToDrizzleTable<T>;
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
        '@mionjs/drizzle-orm-sqlite-core: toDrizzle() takes a slim table or the marker form toDrizzle<NotesTable>(options?)'
      );
    }
  }
  const slim = tableFromType(value as TableFromTypeOptions | undefined, id as InjectRunTypeId<AnySqliteTable> | undefined);
  return materializeRtTable(slim, context);
}

/** A non-table object arg is only valid as the marker form's options bag. */
function isTableOptions(value: object): boolean {
  return Object.keys(value).every((key) => key === 'tables' || key === 'runtime');
}
