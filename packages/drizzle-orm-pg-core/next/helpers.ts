/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Side-by-side helpers whose types name columns: the shipped recorders, typed for the new columns.

import {foreignKey as shippedForeignKey, pgEnum as shippedPgEnum, type RtForeignKeyEntry} from '../src/helpers.ts';
import type {PgColIn} from './columns.ts';
import type {Column, NamedColumn, Only, PropsOf} from '../../drizzle-orm/next/columns.ts';
import {recordColumn} from '../../drizzle-orm/next/recorder.ts';
import {refColumn, type AnyTableRef} from '../../drizzle-orm/next/table.ts';
import type {RtColumnRecorder} from '../../drizzle-orm/src/recorder.ts';
import type {AnyColumn, NoProps} from '../../drizzle-orm/next/columns.ts';

type Writable<T> = {-readonly [K in keyof T]: T[K]};
type NonArray<T> = T extends readonly unknown[] ? never : T;

/** A recorded pg enum: a factory of enum column builders, plus what drizzle-kit reads. */
export interface PgEnum<T extends readonly [string, ...string[]]> {
  (): Column<'enum', NoProps, T[number]>;
  <N extends string>(columnName: N): NamedColumn<N, Column<'enum', NoProps, T[number]>>;
  <N extends string, const C extends Only<C, PgColIn>>(
    columnName: N,
    props: C
  ): NamedColumn<N, Column<'enum', PropsOf<C>, T[number]>>;
  <const C extends Only<C, PgColIn>>(props: C): Column<'enum', PropsOf<C>, T[number]>;
  readonly enumName: string;
  readonly enumValues: T;
}
/** The object form: data is the union of its VALUES. */
export interface PgEnumObject<E extends Record<string, string>> {
  (): Column<'enum', NoProps, E[keyof E]>;
  <N extends string>(columnName: N): NamedColumn<N, Column<'enum', NoProps, E[keyof E]>>;
  <N extends string, const C extends Only<C, PgColIn>>(
    columnName: N,
    props: C
  ): NamedColumn<N, Column<'enum', PropsOf<C>, E[keyof E]>>;
  <const C extends Only<C, PgColIn>>(props: C): Column<'enum', PropsOf<C>, E[keyof E]>;
  readonly enumName: string;
  readonly enumValues: E[keyof E][];
}

export function pgEnum<U extends string, T extends Readonly<[U, ...U[]]>>(enumName: string, values: T | Writable<T>): PgEnum<T>;
export function pgEnum<E extends Record<string, string>>(enumName: string, enumObj: NonArray<E>): PgEnumObject<E>;
export function pgEnum(enumName: string, values: readonly string[] | Record<string, string>): unknown {
  return enumFromShipped(shippedPgEnum(enumName, values as never));
}

/** A shipped enum handle taking props: they replay onto its name-only column as modifier calls. */
export function enumFromShipped(shipped: object): unknown {
  const shippedFactory = shipped as (...args: unknown[]) => RtColumnRecorder;
  const factory = (...args: unknown[]) =>
    recordColumn(args, (context, callArgs) => shippedFactory(...callArgs).toDrizzleColumn(context));
  const {enumValues} = shipped as {enumValues: readonly string[] | Record<string, string>};
  // Object.assign keeps the symbol-keyed recorder toDrizzle(handle) materializes.
  return Object.assign(factory, shipped, {enumValues: Array.isArray(enumValues) ? enumValues : Object.values(enumValues)});
}

/** foreignKey over the side-by-side columns: another table's column is a tableRef(), this table's a `t.key`. */
export interface PgForeignKeyConfig {
  name?: string;
  columns: [AnyColumn, ...AnyColumn[]];
  foreignColumns: [AnyColumn | AnyTableRef, ...Array<AnyColumn | AnyTableRef>];
}
export function foreignKey(config: PgForeignKeyConfig): RtForeignKeyEntry {
  const isRef = (column: object): boolean => typeof (column as Partial<AnyTableRef>).table === 'string';
  const foreignColumns = config.foreignColumns.map((column) => (isRef(column) ? refColumn(column) : column));
  return shippedForeignKey({...config, foreignColumns} as never);
}
