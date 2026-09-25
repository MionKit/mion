/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Side-by-side toDrizzle types: the ONE place a column gets its db name and table name back, as
// drizzle's own BuildColumns stamps them (column-builder.d.ts), so that cost is paid only in files
// that materialize a table. The runtime is the shipped toDrizzle, unchanged.

import type {PgColumn as DzPgColumn, PgTableWithColumns, PgViewWithSelection} from 'drizzle-orm/pg-core';
import type {PlainDataOf} from '../../drizzle-orm/src/recorder.ts';
import type {IsHasDefault, IsInsertExcluded, IsNotNull, KeyFlagsOf, ValueOf} from '../../drizzle-orm/next/columns.ts';
import type {rtColSpecKey} from '../../drizzle-orm/next/columns.ts';
import type {DbNameOf} from '../../drizzle-orm/next/table.ts';
import {toDrizzle as toDrizzleRuntime} from '../src/drizzle.ts';
import {rtTableKey, rtViewKey} from '../../drizzle-orm/src/recorder.ts';
import type {InjectRunTypeId} from '@mionjs/run-types';
import type {TableFromTypeOptions} from '../../drizzle-orm/next/fromType.ts';
import {tableFromType} from './table.ts';
import type {AnyPgTable} from './table.ts';
import type {AnyPgView} from './views.ts';

type Spec<C> = C extends {readonly [rtColSpecKey]?: infer S} ? NonNullable<S> : never;

/** Structural PgColumn config; dataType / columnType are fixed because drizzle's typing never branches on them. */
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
      isPrimaryKey: false;
      isAutoincrement: false;
      hasRuntimeDefault: false;
      identity: KeyFlagsOf<S>['identity'];
      generated: IsInsertExcluded<P> extends true
        ? [KeyFlagsOf<S>['identity']] extends [undefined]
          ? {type: 'always'}
          : undefined
        : undefined;
    }
  : never;

/** The drizzle-typed view of a table, evaluated only where toDrizzle is used. */
export type ToDrizzleTable<T extends AnyPgTable> = PgTableWithColumns<{
  name: T['name'];
  schema: undefined;
  dialect: 'pg';
  columns: {[K in keyof T['columns'] & string]: DzPgColumn<SynthConfig<DbNameOf<T, K>, T['name'], Spec<T['columns'][K]>>>};
}>;

/** The drizzle-typed view of a view. */
export type ToDrizzleView<V extends AnyPgView> = PgViewWithSelection<
  V['name'],
  boolean,
  {[K in keyof V['columns'] & string]: DzPgColumn<SynthConfig<DbNameOf<V, K>, V['name'], Spec<V['columns'][K]>>>}
>;

/** Materializes a table or view (memoized), through the shipped runtime. */
export function toDrizzle<T extends AnyPgTable>(table: T): ToDrizzleTable<T>;
export function toDrizzle<V extends AnyPgView>(view: V): ToDrizzleView<V>;
export function toDrizzle<T extends AnyPgTable>(options?: TableFromTypeOptions<T>, id?: InjectRunTypeId<T>): ToDrizzleTable<T>;
export function toDrizzle(value?: object, id?: unknown): unknown {
  if (id !== undefined || value === undefined || !isSlim(value)) {
    return (toDrizzleRuntime as (value: object) => unknown)(
      tableFromType(value as TableFromTypeOptions | undefined, id as never)
    );
  }
  return (toDrizzleRuntime as (value: object) => unknown)(value);
}

function isSlim(value: object): boolean {
  return (
    (value as Record<symbol, unknown>)[rtTableKey] !== undefined || (value as Record<symbol, unknown>)[rtViewKey] !== undefined
  );
}
