/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The ONE place a column gets its db and table names back, as drizzle's BuildColumns stamps them
// (column-builder.d.ts), so only files that materialize a table pay for it. The runtime is the shipped toDrizzle.

import type {IndexBuilder, SQLiteColumn, SQLiteTableWithColumns, SQLiteViewWithSelection} from 'drizzle-orm/sqlite-core';
import type {PlainDataOf} from '../../drizzle-orm/src/recorder.ts';
import type {IsHasDefault, IsInsertExcluded, IsNotNull, ValueOf} from '../../drizzle-orm/next/columns.ts';
import type {rtColSpecKey} from '../../drizzle-orm/next/columns.ts';
import type {DbNameOf} from '../../drizzle-orm/next/table.ts';
import {toDrizzle as toDrizzleRuntime} from '../src/drizzle.ts';
import {RtEntryRecorder, rtTableKey, rtViewKey} from '../../drizzle-orm/src/recorder.ts';
import type {RtSqliteIndexEntry} from '../src/helpers.ts';
import type {InjectRunTypeId} from '@mionjs/run-types';
import type {TableFromTypeOptions} from '../../drizzle-orm/next/fromType.ts';
import {tableFromType} from './table.ts';
import type {AnySqliteTable} from './table.ts';
import type {AnySqliteView} from './views.ts';

type Spec<C> = C extends {readonly [rtColSpecKey]?: infer S} ? NonNullable<S> : never;

/** Structural SQLiteColumn config; dataType / columnType are fixed because drizzle's typing never branches on them. */
type SynthConfig<Name extends string, TName extends string, S> = S extends {config: infer P; data: infer D; base: infer B}
  ? {
      name: Name;
      tableName: TName;
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

/** Materializes a table, view or standalone index (memoized), through the shipped runtime. */
export function toDrizzle<T extends AnySqliteTable>(table: T): ToDrizzleTable<T>;
export function toDrizzle<V extends AnySqliteView>(view: V): ToDrizzleView<V>;
export function toDrizzle(entry: RtSqliteIndexEntry): IndexBuilder;
export function toDrizzle<T extends AnySqliteTable>(
  options?: TableFromTypeOptions<T>,
  id?: InjectRunTypeId<T>
): ToDrizzleTable<T>;
export function toDrizzle(value?: object, id?: unknown): unknown {
  if (id !== undefined || value === undefined || !isRecorded(value)) {
    return (toDrizzleRuntime as (value: object) => unknown)(
      tableFromType(value as TableFromTypeOptions | undefined, id as never)
    );
  }
  return (toDrizzleRuntime as (value: object) => unknown)(value);
}

function isRecorded(value: object): boolean {
  const record = value as Record<symbol, unknown>;
  return record[rtTableKey] !== undefined || record[rtViewKey] !== undefined || value instanceof RtEntryRecorder;
}
