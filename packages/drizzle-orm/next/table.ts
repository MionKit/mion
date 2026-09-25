/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Side-by-side table core: the table type holds the shared, nameless column types unchanged plus the
// table-level metadata (db names that differ from the record key, extras). Owner metadata exists only
// on the cols() view, where references() reads it.

import type {AnyColumn, ColumnOwner} from './columns.ts';
import {rtColNameKey} from './columns.ts';

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

/** The columns of a table as a value, each carrying its owner for references(). Identity at run time. */
export type ColsView<T extends AnyTable> = {[K in keyof T['columns'] & string]: T['columns'][K] & ColumnOwner<T['name'], K>};
export function cols<T extends AnyTable>(table: T): ColsView<T> {
  return table as unknown as ColsView<T>;
}

// ── Lifting builder names into the table ─────────────────────────────────────

type NameOfCol<C> = C extends {readonly [rtColNameKey]?: infer Name} ? Name : undefined;
/** The names map a builder table records: only db names that differ from the key. A mapped type, so it
 *  is resolved only when read, and it equals NoNames when every column is nameless or named as its key. */
export type LiftNames<Cols> = {
  [K in keyof Cols as NameOfCol<Cols[K]> extends string ? (NameOfCol<Cols[K]> extends K ? never : K) : never]: NameOfCol<Cols[K]>;
};
