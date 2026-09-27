/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The mysql authoring helpers beyond columns and tables: enums, indexes, constraints and checks, with
// drizzle-identical names and call shapes and recorder returns.

import type {
  EntryColumn,
  AnyTableRef,
  Column,
  NamedColumn,
  NoProps,
  Only,
  PropsOf,
  RtIndexedColumn,
  RtSql,
} from '@mionjs/drizzle-orm';
import {recordColumn, refColumn, RtEntryRecorder, rtColumnKey} from '@mionjs/drizzle-orm';
import type {MysqlColIn} from './columns.ts';
import type {UpdateDeleteAction} from './types.ts';

type DrizzleWritable<T> = {-readonly [K in keyof T]: T[K]};
type NonArray<T> = T extends readonly unknown[] ? never : T;

/** mysqlEnum(name?, values, props?): the values are a tuple or an enum object, whose data is the union of its VALUES. */
export function mysqlEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
  values: T | DrizzleWritable<T>
): Column<'enum', NoProps, T[number]>;
export function mysqlEnum<U extends string, T extends Readonly<[U, ...U[]]>, const C extends Only<C, MysqlColIn>>(
  values: T | DrizzleWritable<T>,
  props: C
): Column<'enum', PropsOf<C>, T[number]>;
export function mysqlEnum<N extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: N,
  values: T | DrizzleWritable<T>
): NamedColumn<N, Column<'enum', NoProps, T[number]>>;
export function mysqlEnum<
  N extends string,
  U extends string,
  T extends Readonly<[U, ...U[]]>,
  const C extends Only<C, MysqlColIn>,
>(name: N, values: T | DrizzleWritable<T>, props: C): NamedColumn<N, Column<'enum', PropsOf<C>, T[number]>>;
export function mysqlEnum<E extends Record<string, string>>(enumObj: NonArray<E>): Column<'enum', NoProps, E[keyof E]>;
export function mysqlEnum<E extends Record<string, string>, const C extends Only<C, MysqlColIn>>(
  enumObj: NonArray<E>,
  props: C
): Column<'enum', PropsOf<C>, E[keyof E]>;
export function mysqlEnum<N extends string, E extends Record<string, string>>(
  name: N,
  enumObj: NonArray<E>
): NamedColumn<N, Column<'enum', NoProps, E[keyof E]>>;
export function mysqlEnum<N extends string, E extends Record<string, string>, const C extends Only<C, MysqlColIn>>(
  name: N,
  enumObj: NonArray<E>,
  props: C
): NamedColumn<N, Column<'enum', PropsOf<C>, E[keyof E]>>;
export function mysqlEnum(...args: unknown[]): unknown {
  const [name, values, props] = typeof args[0] === 'string' ? args : [undefined, ...args];
  const enumArgs = name === undefined ? [values] : [name, values];
  // drizzle's mysqlEnum takes the values where other builders take a config: the props replay as modifier calls.
  return recordColumn(name === undefined ? [props] : [name, props], (context) => context.ns.mysqlEnum(...(enumArgs as never[])));
}

/** Common brand of every extraConfig entry. */
export interface MyEntryBrand {
  readonly [rtColumnKey]?: {rtEntry: true};
}

export type MyIndexColumn = EntryColumn | RtIndexedColumn | RtSql;

// drizzle's two steps: `on` first, then the index options; an option before `on` does not exist on drizzle's builder.
/** `index(name)` before its columns: only `on`. */
export interface RtMyIndexBuilderOn {
  on(...columns: [MyIndexColumn, ...MyIndexColumn[]]): RtMyIndexEntry;
}
/** An index with its columns: the options drizzle's IndexBuilder takes. */
export interface RtMyIndexEntry extends MyEntryBrand {
  using(method: 'btree' | 'hash'): RtMyIndexEntry;
  algorithm(algorithm: 'default' | 'inplace' | 'copy'): RtMyIndexEntry;
  lock(lock: 'default' | 'none' | 'shared' | 'exclusive'): RtMyIndexEntry;
}
export function index(name: string): RtMyIndexBuilderOn {
  return new RtEntryRecorder('index', [name]) as unknown as RtMyIndexBuilderOn;
}
export function uniqueIndex(name: string): RtMyIndexBuilderOn {
  return new RtEntryRecorder('uniqueIndex', [name]) as unknown as RtMyIndexBuilderOn;
}

export interface RtMyUniqueEntry extends MyEntryBrand {
  on(...columns: [EntryColumn, ...EntryColumn[]]): RtMyUniqueEntry;
}
export function unique(name?: string): RtMyUniqueEntry {
  return new RtEntryRecorder('unique', name === undefined ? [] : [name]) as unknown as RtMyUniqueEntry;
}

/** foreignKey: this table's columns as `t.key`, another table's as a tableRef(). */
export interface MysqlForeignKeyConfig {
  name?: string;
  columns: [EntryColumn, ...EntryColumn[]];
  foreignColumns: [EntryColumn, ...EntryColumn[]];
}
export interface RtMyForeignKeyEntry extends MyEntryBrand {
  onDelete(action: UpdateDeleteAction): RtMyForeignKeyEntry;
  onUpdate(action: UpdateDeleteAction): RtMyForeignKeyEntry;
}
export function foreignKey(config: MysqlForeignKeyConfig): RtMyForeignKeyEntry {
  const isRef = (column: object): boolean => typeof (column as Partial<AnyTableRef>).table === 'string';
  const foreignColumns = config.foreignColumns.map((column) => (isRef(column) ? refColumn(column) : column));
  return new RtEntryRecorder('foreignKey', [{...config, foreignColumns}]) as unknown as RtMyForeignKeyEntry;
}

export interface MysqlPrimaryKeyConfig {
  name?: string;
  columns: [EntryColumn, ...EntryColumn[]];
}
export type RtMyPrimaryKeyEntry = MyEntryBrand;
export function primaryKey(config: MysqlPrimaryKeyConfig): RtMyPrimaryKeyEntry {
  return new RtEntryRecorder('primaryKey', [config]) as unknown as RtMyPrimaryKeyEntry;
}

export type RtMyCheckEntry = MyEntryBrand;
export function check(name: string, value: RtSql): RtMyCheckEntry {
  return new RtEntryRecorder('check', [name, value]) as unknown as RtMyCheckEntry;
}
