/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The ONE module that imports drizzle-orm, so a project that never calls toDrizzle never loads it (an optional peer).
// Types are synthesized structural column configs. The ONE place a column gets its db and table names back, so only
// files that materialize a table pay for it.

import * as dzSqlite from 'drizzle-orm/sqlite-core';
import {sql as dzSql} from 'drizzle-orm';
import type {IndexBuilder, SQLiteColumn, SQLiteTableWithColumns, SQLiteViewWithSelection} from 'drizzle-orm/sqlite-core';
import type {
  PlainDataOf,
  IsHasDefault,
  IsInsertExcluded,
  IsNotNull,
  ValueOf,
  rtColSpecKey,
  DbNameOf,
  TableFromTypeOptions,
  DrizzleContext,
} from '@mionjs/drizzle-orm';
import type {RtSqliteIndexEntry} from './helpers.ts';
import type {InjectRunTypeId} from '@mionjs/run-types';
import {tableFromType} from './table.ts';
import type {AnySqliteTable} from './table.ts';
import type {AnySqliteView} from './views.ts';

import {
  isRtView,
  materializeRtTable,
  materializeRtView,
  RtEntryRecorder,
  RtValueRecorder,
  rtTableKey,
  rtValueKey,
} from '@mionjs/drizzle-orm';

const context: DrizzleContext = {
  ns: dzSqlite as unknown as DrizzleContext['ns'],
  sqlNs: dzSql as unknown as DrizzleContext['sqlNs'],
};

type Spec<C> = C extends {readonly [rtColSpecKey]?: infer S} ? NonNullable<S> : never;

/** Structural SQLiteColumn config; dataType / columnType are fixed because drizzle's typing never branches on them. */
type SynthConfig<Name extends string, TableName extends string, S> = S extends {config: infer P; data: infer D; base: infer B}
  ? {
      name: Name;
      tableName: TableName;
      dataType: 'custom';
      columnType: 'RtColumn';
      data: PlainDataOf<ValueOf<P, D>>;
      driverParam: unknown;
      enumValues: undefined;
      notNull: IsNotNull<P, B>;
      hasDefault: IsHasDefault<P, B>;
      // Fixed, and only safe because sqlite reads none of the three: mysql's `$returningId()` does.
      isPrimaryKey: false;
      isAutoincrement: false;
      hasRuntimeDefault: false;
      identity: undefined;
      generated: IsInsertExcluded<P> extends true ? {type: 'always'} : undefined;
    }
  : never;

/** The drizzle-typed view of a table, evaluated only where toDrizzle is used. */
export type ToDrizzleTable<T extends AnySqliteTable> = SQLiteTableWithColumns<{
  name: T['name'];
  schema: undefined;
  dialect: 'sqlite';
  columns: {[K in keyof T['columns'] & string]: SQLiteColumn<SynthConfig<DbNameOf<T, K>, T['name'], Spec<T['columns'][K]>>>};
}>;

/** The drizzle-typed view of a view. */
export type ToDrizzleView<V extends AnySqliteView> = SQLiteViewWithSelection<
  V['name'],
  boolean,
  {[K in keyof V['columns'] & string]: SQLiteColumn<SynthConfig<DbNameOf<V, K>, V['name'], Spec<V['columns'][K]>>>}
>;

/** Materializes a table, view or standalone index (memoized), or a table type by its marker. */
export function toDrizzle<T extends AnySqliteTable>(table: T): ToDrizzleTable<T>;
export function toDrizzle<V extends AnySqliteView>(view: V): ToDrizzleView<V>;
export function toDrizzle(entry: RtSqliteIndexEntry): IndexBuilder;
export function toDrizzle<T extends AnySqliteTable>(
  options?: TableFromTypeOptions<T>,
  id?: InjectRunTypeId<T>
): ToDrizzleTable<T>;
export function toDrizzle(value?: object, id?: unknown): unknown {
  if (value !== undefined) {
    const attached = (value as Record<symbol, unknown>)[rtValueKey];
    if (attached instanceof RtValueRecorder) return attached.toDrizzleValue(context);
    // A standalone ENTRY, declared outside any table's extraConfig: `.useIndex(idx)` wants its own IndexBuilder.
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
