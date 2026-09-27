/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The ONE module that imports drizzle-orm, so a project that never calls toDrizzle never loads it (an optional peer).
// Types are synthesized PgColumn configs: drizzle's typing reads only data / notNull / hasDefault / generated / identity.
// The ONE place a column gets its db and table names back, so only files that materialize a table pay for it.

import * as dzPg from 'drizzle-orm/pg-core';
import {sql as dzSql} from 'drizzle-orm';
import type {PgColumn as DzPgColumn, PgTableWithColumns, PgViewWithSelection} from 'drizzle-orm/pg-core';
import type {
  DbNameOf,
  DrizzleContext,
  IsHasDefault,
  IsInsertExcluded,
  IsNotNull,
  KeyFlagsOf,
  TableFromTypeOptions,
  ValueOf,
  ColSpecOf,
} from '@mionjs/drizzle-orm';
import {
  isRtView,
  materializeRtTable,
  materializeRtView,
  RtEntryRecorder,
  RtValueRecorder,
  rtTableKey,
  rtValueKey,
} from '@mionjs/drizzle-orm';
import type {InjectRunTypeId} from '@mionjs/run-types';
import type {PgEnum, PgEnumObject, PgRole, RtLinkedPolicy, RtPolicyEntry} from './helpers.ts';
import {tableFromType, type PgSchema, type PgSequence} from './table.ts';
import type {AnyPgTable, AnyPgView, RtIndexEntry} from './types.ts';

const context: DrizzleContext = {
  ns: dzPg as unknown as DrizzleContext['ns'],
  sqlNs: dzSql as unknown as DrizzleContext['sqlNs'],
};

/** Structural PgColumn config; dataType / columnType are fixed because drizzle's typing never branches on them. */
type SynthConfig<Name extends string, TableName extends string, S> = S extends {config: infer P; data: infer D; base: infer B}
  ? {
      name: Name;
      tableName: TableName;
      dataType: 'custom';
      columnType: 'RtColumn';
      data: ValueOf<P, D>;
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
  columns: {[K in keyof T['columns'] & string]: DzPgColumn<SynthConfig<DbNameOf<T, K>, T['name'], ColSpecOf<T['columns'][K]>>>};
}>;

/** The drizzle-typed view of a view. */
export type ToDrizzleView<V extends AnyPgView> = PgViewWithSelection<
  V['name'],
  boolean,
  {[K in keyof V['columns'] & string]: DzPgColumn<SynthConfig<DbNameOf<V, K>, V['name'], ColSpecOf<V['columns'][K]>>>}
>;

// The marker form `toDrizzle<UsersTable>(options?)` needs @mionjs/devtools and shares tableFromType's per-type table.
/** Materializes a table (memoized), a view, or a recorded handle a drizzle-kit schema file exports beside the tables. */
export function toDrizzle<T extends AnyPgTable>(table: T): ToDrizzleTable<T>;
export function toDrizzle<V extends AnyPgView>(view: V): ToDrizzleView<V>;
export function toDrizzle<T extends readonly [string, ...string[]]>(handle: PgEnum<T>): dzPg.PgEnum<[T[0], ...string[]]>;
export function toDrizzle<E extends Record<string, string>>(handle: PgEnumObject<E>): dzPg.PgEnumObject<E>;
export function toDrizzle(handle: PgSchema): dzPg.PgSchema;
export function toDrizzle(handle: PgSequence): dzPg.PgSequence;
export function toDrizzle(handle: PgRole): dzPg.PgRole;
export function toDrizzle(handle: RtLinkedPolicy): dzPg.PgPolicy;
export function toDrizzle(handle: RtPolicyEntry): dzPg.PgPolicy;
// An index declared outside any table's extraConfig: drizzle's query side wants its own IndexBuilder.
export function toDrizzle(entry: RtIndexEntry): dzPg.IndexBuilder;
export function toDrizzle<T extends AnyPgTable>(options?: TableFromTypeOptions<T>, id?: InjectRunTypeId<T>): ToDrizzleTable<T>;
export function toDrizzle(value?: object, id?: unknown): unknown {
  if (value !== undefined) {
    const attached = (value as Record<symbol, unknown>)[rtValueKey];
    if (attached instanceof RtValueRecorder) return attached.toDrizzleValue(context);
    // A standalone ENTRY (a linked policy, an index) belongs to no extraConfig, so it materializes on its own.
    if (value instanceof RtEntryRecorder) return value.toDrizzleEntry(context);
    if (isRtView(value)) return materializeRtView(value, context);
    if ((value as Record<symbol, unknown>)[rtTableKey] !== undefined) return materializeRtTable(value, context);
    if (id === undefined && !isTableOptions(value)) {
      throw new Error(
        '@mionjs/drizzle-orm-pg-core: toDrizzle() takes a slim table, a pgEnum/pgSchema/pgSequence/pgRole handle, ' +
          'a pgPolicy, or the marker form toDrizzle<UsersTable>(options?)'
      );
    }
  }
  const slim = tableFromType(value as TableFromTypeOptions | undefined, id as InjectRunTypeId<AnyPgTable> | undefined);
  return materializeRtTable(slim, context);
}

/** A non-table object arg is only valid as the marker form's options bag. */
function isTableOptions(value: object): boolean {
  return Object.keys(value).every((key) => key === 'tables' || key === 'runtime');
}
