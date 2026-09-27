/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Slim table core: the table TYPE (shared nameless columns plus a names map), the runtime object a dialect's table
// factory returns (the column recorders as properties plus metadata under the rtTableKey symbol), and the traversal
// that materializes the real drizzle table on demand. A reference names its target with a TableRef, never a column type.

import type {DrizzleContext} from './recorder.ts';
import {
  type ExtraConfigScope,
  RtColumnRecorder,
  RtEntryRecorder,
  RtIndexedColumnClass,
  RtSqlRecorder,
  rtTableBrand,
  rtRefTargetKey,
  rtTableKey,
  rtViewKey,
  setResolveRecorded,
  type IndexedColumnInternal,
} from './recorder.ts';
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

/** A reference to one column of another table, as plain data. Takes a table name for a self-reference. */
export type TableRef<T extends RefTable | string, K extends RefKeyOf<T>> = T extends string
  ? {table: T; column: K}
  : {table: (T & RefTable)['name']; column: K};
// Only what the ref reads: checking a table against AnyTable walks all its columns.
type RefTable = {name: string; columns: object};
type RefKeyOf<T> = T extends string ? string : keyof (T & RefTable)['columns'] & string;
export type AnyTableRef = {table: string; column: string};

/** For `references: [() => tableRef(teams, 'id')]` and foreignKey's foreignColumns. */
export function tableRef<T extends AnyTable, K extends keyof T['columns'] & string>(
  table: T,
  column: K
): {table: T['name']; column: K} {
  const runtime = (table as unknown as Record<symbol, {name: string} | undefined>)[rtTableKey];
  if (runtime === undefined)
    throw new Error('@mionjs/drizzle-orm: tableRef() takes a table built with pgTable(), mysqlTable() or sqliteTable()');
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

/** The brand each DIALECT adds to its own table interface: what marks a node a table in the
 *  reflected graph, and what carries the dialect that recorded it.
 *  It stops a table reaching another dialect's toDrizzle: materialization replays the table's OWN
 *  buildTable closure against whatever context it is handed, so a pg table run through mysql's
 *  toDrizzle used to reach for `context.ns.pgTable` and find nothing. Optional (the house sentinel
 *  convention) and still rejecting that call, since `'pg' | undefined` is not assignable to
 *  `'mysql' | undefined`.
 *  On the dialect interfaces rather than RtTableMeta, and a fixed member rather than a type
 *  parameter, because both cost: about 4 instantiations per declared table for a parameter, about 9
 *  for declaring it in core and narrowing it in the dialect. */
export interface RtTableBrand<Dialect extends string> {
  readonly [rtTableBrand]?: Dialect;
}

/** Builds the dialect's drizzle table at materialization; the last argument, passed only when the
 *  slim table recorded an extraConfig, is a replay callback shaped for drizzle's third argument. */
export type BuildTableFn = (
  context: DrizzleContext,
  name: string,
  columnBuilders: Record<string, unknown>,
  extraConfigReplay?: (dzExtraColumns: Record<string, unknown>) => unknown[] | Record<string, unknown>
) => unknown;

interface RtTableRuntime {
  name: string;
  columns: Record<string, RtColumnRecorder>;
  extraConfig?: (self: unknown) => unknown[] | Record<string, unknown>;
  buildTable: BuildTableFn;
  /** Set by the dialect's enableRLS(); replayed on the built drizzle table. */
  rls?: boolean;
  drizzle?: unknown;
}

/** Assemble the slim table object. Every column recorder learns its key and its owning table here,
 *  which is what reference resolution traverses later. */
export function createRtTable(
  name: string,
  columns: Record<string, unknown>,
  extraConfig: ((self: never) => unknown[] | Record<string, unknown>) | undefined,
  buildTable: BuildTableFn
): never {
  const table = {...columns} as Record<string | symbol, unknown>;
  for (const [key, column] of Object.entries(columns)) {
    const recorder = column as RtColumnRecorder;
    if (recorder.table !== undefined) {
      throw new Error(
        `@mionjs/drizzle-orm: column "${key}" of table "${name}" was already used in another table — column builders cannot be shared between tables, create one per table`
      );
    }
    recorder.key = key;
    recorder.table = table;
  }
  const runtime: RtTableRuntime = {
    name,
    columns: columns as Record<string, RtColumnRecorder>,
    extraConfig: extraConfig as RtTableRuntime['extraConfig'],
    buildTable,
  };
  table[rtTableKey] = runtime;
  // Attached on both roads (the type road's bridge builds its table here too), so a dialect that
  // TYPES enableRLS always has it at runtime. Non-enumerable, and never over a real column of that name.
  if (!('enableRLS' in columns)) {
    Object.defineProperty(table, 'enableRLS', {
      value: () => {
        runtime.rls = true;
        return table;
      },
    });
  }
  return table as never;
}

/** Materialize the real drizzle table. Memoized on the table; every call returns the same object. */
export function materializeRtTable(table: object, context: DrizzleContext): unknown {
  const runtime = (table as Record<symbol, RtTableRuntime | undefined>)[rtTableKey];
  if (!runtime) throw new Error('@mionjs/drizzle-orm: toDrizzle() called on a value that is not a slim table');
  if (runtime.drizzle !== undefined) return runtime.drizzle;
  const columnBuilders: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(runtime.columns)) columnBuilders[key] = column.toDrizzleColumn(context);
  const extraConfigReplay = runtime.extraConfig
    ? (dzExtraColumns: Record<string, unknown>) => {
        // A REAL drizzle entry (what provider helpers such as drizzle-orm/neon's crudPolicy return)
        // passes through untouched: it is already the object drizzle wants, with nothing to replay.
        const replay = (entry: unknown) =>
          entry instanceof RtEntryRecorder ? entry.toDrizzleEntry(context, {table, columns: dzExtraColumns}) : entry;
        const entries = runtime.extraConfig!(table as never);
        // drizzle still accepts its LEGACY object form (`(t) => ({idx: index()})`) and reads its keys,
        // so the shape has to survive. An array is flattened one level first, exactly as drizzle does
        // (`extraConfig.flat(1)`), or a grouped entry would reach it as a bare array of recorders.
        if (Array.isArray(entries)) return entries.flat(1).map(replay);
        return Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, replay(entry)]));
      }
    : undefined;
  const built = runtime.buildTable(context, runtime.name, columnBuilders, extraConfigReplay);
  runtime.drizzle = runtime.rls ? (built as {enableRLS(): unknown}).enableRLS() : built;
  return runtime.drizzle;
}

// Recorded-argument resolution, registered into recorder.ts to break the module cycle: a slim column
// resolves through its OWN table's materialized drizzle table, except same-table refs inside an
// extraConfig replay, which resolve to the (index-capable) columns drizzle handed that callback.
setResolveRecorded((value, context, extra) => {
  if (value instanceof RtSqlRecorder) return value.toDrizzleSql(context, extra);
  if (value instanceof RtIndexedColumnClass) {
    const indexed = value as unknown as IndexedColumnInternal;
    let dzColumn = resolveColumn(indexed.column, context, extra) as Record<string, (...a: unknown[]) => unknown>;
    for (const {method, args} of indexed.calls) dzColumn = dzColumn[method](...args) as typeof dzColumn;
    return dzColumn;
  }
  if (value instanceof RtColumnRecorder) return resolveColumn(value, context, extra);
  return materializeOwner(value as object, context);
});

/** view.ts registers its materializer here at load (the inversion recorder.ts uses for
 *  resolveRecorded): with no import, a program that never declares a view never pulls the view types in. */
let materializeView: ((view: object, context: DrizzleContext) => unknown) | undefined;
export function setViewMaterializer(materializer: typeof materializeView): void {
  materializeView = materializer;
}

function materializeOwner(owner: object, context: DrizzleContext): unknown {
  if (typeof (owner as Record<symbol, unknown>)[rtViewKey] === 'object') {
    if (!materializeView) throw new Error('@mionjs/drizzle-orm internal: view materializer not registered');
    return materializeView(owner, context);
  }
  return materializeRtTable(owner, context);
}

function resolveColumn(column: RtColumnRecorder, context: DrizzleContext, extra?: ExtraConfigScope): unknown {
  if (!column.table) {
    throw new Error('@mionjs/drizzle-orm: a column was referenced before being placed in a table');
  }
  if (extra && column.table === extra.table) return extra.columns[column.key];
  const dzOwner = materializeOwner(column.table, context) as Record<string, unknown>;
  return dzOwner[column.key];
}
