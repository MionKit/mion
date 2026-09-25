/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Side-by-side helpers whose types name columns: the shipped recorders, typed for the new columns.

import {foreignKey as shippedForeignKey, type RtMyForeignKeyEntry} from '../src/helpers.ts';
import {mysqlEnum as shippedMysqlEnum} from '../src/columns.ts';
import type {MysqlColIn} from './columns.ts';
import type {AnyColumn, Column, NamedColumn, NoProps, PropsOf} from '../../drizzle-orm/next/columns.ts';
import {recordColumn} from '../../drizzle-orm/next/recorder.ts';
import {refColumn, type AnyTableRef} from '../../drizzle-orm/next/table.ts';
import type {RtColumnRecorder} from '../../drizzle-orm/src/recorder.ts';

type Writable<T> = {-readonly [K in keyof T]: T[K]};
type NonArray<T> = T extends readonly unknown[] ? never : T;

/** mysqlEnum(name?, values, props?): the values are a tuple or an enum object, whose data is the union of its VALUES. */
export function mysqlEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
  values: T | Writable<T>
): Column<'enum', NoProps, T[number]>;
export function mysqlEnum<U extends string, T extends Readonly<[U, ...U[]]>, const C extends MysqlColIn>(
  values: T | Writable<T>,
  props: C
): Column<'enum', PropsOf<C>, T[number]>;
export function mysqlEnum<N extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: N,
  values: T | Writable<T>
): NamedColumn<N, Column<'enum', NoProps, T[number]>>;
export function mysqlEnum<N extends string, U extends string, T extends Readonly<[U, ...U[]]>, const C extends MysqlColIn>(
  name: N,
  values: T | Writable<T>,
  props: C
): NamedColumn<N, Column<'enum', PropsOf<C>, T[number]>>;
export function mysqlEnum<E extends Record<string, string>>(enumObj: NonArray<E>): Column<'enum', NoProps, E[keyof E]>;
export function mysqlEnum<E extends Record<string, string>, const C extends MysqlColIn>(
  enumObj: NonArray<E>,
  props: C
): Column<'enum', PropsOf<C>, E[keyof E]>;
export function mysqlEnum<N extends string, E extends Record<string, string>>(
  name: N,
  enumObj: NonArray<E>
): NamedColumn<N, Column<'enum', NoProps, E[keyof E]>>;
export function mysqlEnum<N extends string, E extends Record<string, string>, const C extends MysqlColIn>(
  name: N,
  enumObj: NonArray<E>,
  props: C
): NamedColumn<N, Column<'enum', PropsOf<C>, E[keyof E]>>;
export function mysqlEnum(...args: unknown[]): unknown {
  const [name, values, props] = typeof args[0] === 'string' ? args : [undefined, ...args];
  const shippedArgs = name === undefined ? [values] : [name, values];
  // The shipped enum column takes the values, not a config: the props replay onto it as modifier calls.
  return recordColumn(name === undefined ? [props] : [name, props], (context) =>
    (shippedMysqlEnum as (...enumArgs: unknown[]) => RtColumnRecorder)(...shippedArgs).toDrizzleColumn(context)
  );
}

/** foreignKey over the side-by-side columns: another table's column is a tableRef(), this table's a `t.key`. */
export interface MysqlForeignKeyConfig {
  name?: string;
  columns: [AnyColumn, ...AnyColumn[]];
  foreignColumns: [AnyColumn | AnyTableRef, ...Array<AnyColumn | AnyTableRef>];
}
export function foreignKey(config: MysqlForeignKeyConfig): RtMyForeignKeyEntry {
  const isRef = (column: object): boolean => typeof (column as Partial<AnyTableRef>).table === 'string';
  const foreignColumns = config.foreignColumns.map((column) => (isRef(column) ? refColumn(column) : column));
  return shippedForeignKey({...config, foreignColumns} as never);
}
