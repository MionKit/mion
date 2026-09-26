/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The ONE place a column gets its db and table names back, as drizzle's BuildColumns stamps them
// (column-builder.d.ts), so only files that materialize a table pay for it. The runtime is the shipped toDrizzle.

import type {
  IndexBuilder,
  MySqlColumn,
  MySqlSchema as DzMySqlSchema,
  MySqlTableWithColumns,
  MySqlViewWithSelection,
} from 'drizzle-orm/mysql-core';
import type {PlainDataOf} from '../../drizzle-orm/src/recorder.ts';
import type {IsHasDefault, IsInsertExcluded, IsNotNull, KeyFlagsOf, ValueOf} from '../../drizzle-orm/next/columns.ts';
import type {rtColSpecKey} from '../../drizzle-orm/next/columns.ts';
import type {DbNameOf} from '../../drizzle-orm/next/table.ts';
import {toDrizzle as toDrizzleRuntime} from '../src/drizzle.ts';
import type {RtMyIndexEntry} from '../src/helpers.ts';
import {RtEntryRecorder, rtTableKey, rtValueKey, rtViewKey} from '../../drizzle-orm/src/recorder.ts';
import type {InjectRunTypeId} from '@mionjs/run-types';
import type {TableFromTypeOptions} from '../../drizzle-orm/next/fromType.ts';
import {tableFromType} from './table.ts';
import type {AnyMysqlTable, MySqlSchema} from './table.ts';
import type {AnyMysqlView} from './views.ts';

type Spec<C> = C extends {readonly [rtColSpecKey]?: infer S} ? NonNullable<S> : never;

// Real key flags, not false as in pg and sqlite: `$returningId()` reads them and would infer `{}`.
/** Structural MySqlColumn config; dataType / columnType are fixed because drizzle's typing never branches on them. */
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
      isPrimaryKey: KeyFlagsOf<S>['primaryKey'];
      isAutoincrement: KeyFlagsOf<S>['autoincrement'];
      hasRuntimeDefault: KeyFlagsOf<S>['runtimeDefault'];
      identity: undefined;
      generated: IsInsertExcluded<P> extends true ? {type: 'always'} : undefined;
    }
  : never;

/** The drizzle-typed view of a table, evaluated only where toDrizzle is used. */
export type ToDrizzleTable<T extends AnyMysqlTable> = MySqlTableWithColumns<{
  name: T['name'];
  schema: undefined;
  dialect: 'mysql';
  columns: {[K in keyof T['columns'] & string]: MySqlColumn<SynthConfig<DbNameOf<T, K>, T['name'], Spec<T['columns'][K]>>>};
}>;

/** The drizzle-typed view of a view. */
export type ToDrizzleView<V extends AnyMysqlView> = MySqlViewWithSelection<
  V['name'],
  boolean,
  {[K in keyof V['columns'] & string]: MySqlColumn<SynthConfig<DbNameOf<V, K>, V['name'], Spec<V['columns'][K]>>>}
>;

/** Materializes a table, view, schema handle or standalone index (memoized), through the shipped runtime. */
export function toDrizzle<T extends AnyMysqlTable>(table: T): ToDrizzleTable<T>;
export function toDrizzle<V extends AnyMysqlView>(view: V): ToDrizzleView<V>;
export function toDrizzle(handle: MySqlSchema): DzMySqlSchema;
// An index declared outside any table's extraConfig: drizzle's `.useIndex(idx)` wants its own IndexBuilder.
export function toDrizzle(entry: RtMyIndexEntry): IndexBuilder;
export function toDrizzle<T extends AnyMysqlTable>(options?: TableFromTypeOptions<T>, id?: InjectRunTypeId<T>): ToDrizzleTable<T>;
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
  return (
    record[rtTableKey] !== undefined ||
    record[rtViewKey] !== undefined ||
    record[rtValueKey] !== undefined ||
    value instanceof RtEntryRecorder
  );
}
