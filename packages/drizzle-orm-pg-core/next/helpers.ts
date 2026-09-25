/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Side-by-side pgEnum: the shipped recorder and handle, typed to produce the new column builders.

import {pgEnum as shippedPgEnum} from '../src/helpers.ts';
import type {PgColumnBuilder} from './columns.ts';
import type {NoProps} from '../../drizzle-orm/next/columns.ts';

type Writable<T> = {-readonly [K in keyof T]: T[K]};
type NonArray<T> = T extends readonly unknown[] ? never : T;

/** A recorded pg enum: a factory of enum column builders, plus what drizzle-kit reads. */
export interface PgEnum<T extends readonly [string, ...string[]]> {
  (): PgColumnBuilder<'enum', NoProps, T[number]>;
  <N extends string>(columnName: N): PgColumnBuilder<'enum', NoProps, T[number], never, N>;
  readonly enumName: string;
  readonly enumValues: T;
}
/** The object form: data is the union of its VALUES. */
export interface PgEnumObject<E extends Record<string, string>> {
  (): PgColumnBuilder<'enum', NoProps, E[keyof E]>;
  <N extends string>(columnName: N): PgColumnBuilder<'enum', NoProps, E[keyof E], never, N>;
  readonly enumName: string;
  readonly enumValues: E[keyof E][];
}

export function pgEnum<U extends string, T extends Readonly<[U, ...U[]]>>(enumName: string, values: T | Writable<T>): PgEnum<T>;
export function pgEnum<E extends Record<string, string>>(enumName: string, enumObj: NonArray<E>): PgEnumObject<E>;
export function pgEnum(enumName: string, values: readonly string[] | Record<string, string>): unknown {
  return shippedPgEnum(enumName, values as never);
}
