/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Side-by-side helpers whose types name columns: the shipped recorders, typed for the new columns.

import {foreignKey as shippedForeignKey, pgEnum as shippedPgEnum, type RtForeignKeyEntry} from '../src/helpers.ts';
import type {PgColIn} from './columns.ts';
import type {Column, NamedColumn, PropsOf} from '../../drizzle-orm/next/columns.ts';
import {recordColumn} from '../../drizzle-orm/next/recorder.ts';
import {RtColumnRecorder} from '../../drizzle-orm/src/recorder.ts';
import type {AnyColumn, NoProps} from '../../drizzle-orm/next/columns.ts';

type Writable<T> = {-readonly [K in keyof T]: T[K]};
type NonArray<T> = T extends readonly unknown[] ? never : T;

/** A recorded pg enum: a factory of enum column builders, plus what drizzle-kit reads. */
export interface PgEnum<T extends readonly [string, ...string[]]> {
  (): Column<'enum', NoProps, T[number]>;
  <const C extends PgColIn>(props: C): Column<'enum', PropsOf<C>, T[number]>;
  <N extends string>(columnName: N): NamedColumn<N, Column<'enum', NoProps, T[number]>>;
  <N extends string, const C extends PgColIn>(columnName: N, props: C): NamedColumn<N, Column<'enum', PropsOf<C>, T[number]>>;
  readonly enumName: string;
  readonly enumValues: T;
}
/** The object form: data is the union of its VALUES. */
export interface PgEnumObject<E extends Record<string, string>> {
  (): Column<'enum', NoProps, E[keyof E]>;
  <const C extends PgColIn>(props: C): Column<'enum', PropsOf<C>, E[keyof E]>;
  <N extends string>(columnName: N): NamedColumn<N, Column<'enum', NoProps, E[keyof E]>>;
  <N extends string, const C extends PgColIn>(columnName: N, props: C): NamedColumn<N, Column<'enum', PropsOf<C>, E[keyof E]>>;
  readonly enumName: string;
  readonly enumValues: E[keyof E][];
}

export function pgEnum<U extends string, T extends Readonly<[U, ...U[]]>>(enumName: string, values: T | Writable<T>): PgEnum<T>;
export function pgEnum<E extends Record<string, string>>(enumName: string, enumObj: NonArray<E>): PgEnumObject<E>;
export function pgEnum(enumName: string, values: readonly string[] | Record<string, string>): unknown {
  const shipped = shippedPgEnum(enumName, values as never) as unknown as (...args: unknown[]) => RtColumnRecorder;
  // The shipped enum column takes only a name; the props replay onto it as modifier calls.
  const factory = (...args: unknown[]) =>
    recordColumn(args, (context, callArgs) => (shipped(...callArgs) as RtColumnRecorder).toDrizzleColumn(context));
  return Object.assign(factory, shipped);
}

/** foreignKey over the side-by-side columns: `cols(parent).id` carries no shipped column brand. */
export interface PgForeignKeyConfig {
  name?: string;
  columns: [AnyColumn, ...AnyColumn[]];
  foreignColumns: [AnyColumn, ...AnyColumn[]];
}
export function foreignKey(config: PgForeignKeyConfig): RtForeignKeyEntry {
  return shippedForeignKey(config as never);
}
