/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The ONE module that imports drizzle-orm, so a project that never calls toDrizzle never loads it (an optional peer).
// Types are synthesized structural column configs. The ONE place a column gets its db and table names back, so only
// files that materialize a table pay for it.

import * as dzMy from 'drizzle-orm/mysql-core';
import {sql as dzSql} from 'drizzle-orm';
import type {
  IndexBuilder,
  MySqlColumn,
  MySqlSchema as DzMySqlSchema,
  MySqlTableWithColumns,
  MySqlViewWithSelection,
} from 'drizzle-orm/mysql-core';
import type {
  PlainDataOf,
  IsHasDefault,
  IsInsertExcluded,
  IsNotNull,
  KeyFlagsOf,
  ValueOf,
  rtColSpecKey,
  DbNameOf,
  TableFromTypeOptions,
  DrizzleContext,
} from '@mionjs/drizzle-orm';
import type {RtMyIndexEntry} from './helpers.ts';
import type {InjectRunTypeId} from '@mionjs/run-types';
import {tableFromType} from './table.ts';
import type {AnyMysqlTable, MySqlSchema} from './table.ts';
import type {AnyMysqlView} from './views.ts';

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
  ns: dzMy as unknown as DrizzleContext['ns'],
  sqlNs: dzSql as unknown as DrizzleContext['sqlNs'],
};

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

/** Materializes a table, view, schema handle or standalone index (memoized), or a table type by its marker. */
export function toDrizzle<T extends AnyMysqlTable>(table: T): ToDrizzleTable<T>;
export function toDrizzle<V extends AnyMysqlView>(view: V): ToDrizzleView<V>;
export function toDrizzle(handle: MySqlSchema): DzMySqlSchema;
// An index declared outside any table's extraConfig: drizzle's `.useIndex(idx)` wants its own IndexBuilder.
export function toDrizzle(entry: RtMyIndexEntry): IndexBuilder;
export function toDrizzle<T extends AnyMysqlTable>(options?: TableFromTypeOptions<T>, id?: InjectRunTypeId<T>): ToDrizzleTable<T>;
export function toDrizzle(value?: object, id?: unknown): unknown {
  if (value !== undefined) {
    const attached = (value as Record<symbol, unknown>)[rtValueKey];
    if (attached instanceof RtValueRecorder) return attached.toDrizzleValue(context);
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
  const slim = tableFromType(value as TableFromTypeOptions | undefined, id as InjectRunTypeId<AnyMysqlTable> | undefined);
  return materializeRtTable(slim, context);
}

/** A non-table object arg is only valid as the marker form's options bag. */
function isTableOptions(value: object): boolean {
  return Object.keys(value).every((key) => key === 'tables' || key === 'runtime');
}
