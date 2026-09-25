/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Column types stay shared and nameless in a table; a reference names its target with a TableRef, never a column type.

import {rtTableKey} from '../src/recorder.ts';
import type {AnyColumn} from './columns.ts';

/** A table's type: name, the shared column types, extras, and the db names that differ from the key. */
export interface RtTableMeta<TName extends string, Cols, Extras extends readonly object[] = [], Names = NoNames> {
  name: TName;
  columns: Cols;
  extras: Extras;
  names: Names;
}
/** The names map of a table whose every db name is its record key. */
export type NoNames = Record<never, never>;
export type AnyTable = RtTableMeta<string, Record<string, AnyColumn>, readonly object[], object>;

export type TableNameOf<T extends AnyTable> = T['name'];
export type ColsOf<T extends AnyTable> = T['columns'];
export type NamesOf<T extends AnyTable> = T['names'];
/** The db name of one column of a table or view: the names map entry, else the record key. */
export type DbNameOf<T extends {names: object}, K extends string> = K extends keyof T['names'] ? T['names'][K] & string : K;

/** A view's type: the table meta minus extras, since a view has none. */
export interface RtViewMeta<TName extends string, Cols, Names = NoNames> {
  name: TName;
  columns: Cols;
  names: Names;
}
export type AnyView = RtViewMeta<string, Record<string, AnyColumn>, object>;

/** A reference to one column of another table, as plain data. Takes a table name for a self-reference. */
export type TableRef<T extends RefTable | string, K extends RefKeyOf<T>> = T extends string
  ? {table: T; column: K}
  : {table: (T & RefTable)['name']; column: K};
// Only what the ref reads: checking a table against AnyTable walks all its columns.
type RefTable = {name: string; columns: object};
type RefKeyOf<T> = T extends string ? string : keyof (T & RefTable)['columns'] & string;
export type AnyTableRef = {table: string; column: string};

/** Hidden key of the live table behind a tableRef() value. */
const rtRefTargetKey = Symbol('rtRefTarget');

/** For `references: [() => tableRef(teams, 'id')]` and foreignKey's foreignColumns. */
export function tableRef<T extends AnyTable, K extends keyof T['columns'] & string>(
  table: T,
  column: K
): {table: T['name']; column: K} {
  const runtime = (table as unknown as Record<symbol, {name: string} | undefined>)[rtTableKey];
  if (runtime === undefined) throw new Error('@mionjs/drizzle-orm: tableRef() takes a table built with pgTable()');
  const ref = {table: runtime.name, column};
  Object.defineProperty(ref, rtRefTargetKey, {value: table});
  return ref as {table: T['name']; column: K};
}

/** The live column a tableRef() value points at. */
export function refColumn(ref: unknown): unknown {
  const {column} = ref as AnyTableRef;
  const table = (ref as Record<symbol, Record<string, unknown> | undefined>)[rtRefTargetKey];
  if (table === undefined) throw new Error('@mionjs/drizzle-orm: a reference must be written with tableRef(table, column)');
  if (table[column] === undefined) throw new Error(`@mionjs/drizzle-orm: tableRef() found no column "${column}"`);
  return table[column];
}
