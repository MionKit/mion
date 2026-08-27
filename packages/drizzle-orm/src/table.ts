/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Slim table core: the runtime object a dialect's table factory returns (the
// column recorders as properties plus metadata under the rtTableKey symbol) and
// the traversal that materializes the real drizzle table on demand. The
// dialect's `pgTable`/`mysqlTable`/`sqliteTable` calls createRtTable with a
// buildTable closure that knows which drizzle factory to call; the dialect's
// `toDrizzle` calls materializeRtTable with the injected DrizzleContext.

import type {AnyRtColumn, DrizzleContext} from './recorder.ts';
import {
  type ExtraConfigScope,
  RtColumnRecorder,
  RtEntryRecorder,
  RtIndexedColumnClass,
  RtSqlRecorder,
  rtTableKey,
  setResolveRecorded,
  type IndexedColumnInternal,
} from './recorder.ts';

export interface RtTableMeta<TName extends string, Cols> {
  name: TName;
  columns: Cols;
}
/** A slim table: the columns as properties plus the metadata brand. */
export type RtTable<TName extends string, Cols> = Cols & {readonly [rtTableKey]: RtTableMeta<TName, Cols>};
export type AnyRtTable = {readonly [rtTableKey]: RtTableMeta<string, Record<string, AnyRtColumn>>};

export type TableNameOf<T extends AnyRtTable> = T[typeof rtTableKey]['name'];
export type ColsOf<T extends AnyRtTable> = T[typeof rtTableKey]['columns'];

/** Builds the dialect's drizzle table at materialization: called with the
 *  context, the materialized column builders, and (when the slim table has an
 *  extraConfig) a replay callback shaped for drizzle's third argument. */
export type BuildTableFn = (
  context: DrizzleContext,
  name: string,
  columnBuilders: Record<string, unknown>,
  extraConfigReplay?: (dzExtraColumns: Record<string, unknown>) => unknown[]
) => unknown;

interface RtTableRuntime {
  name: string;
  columns: Record<string, RtColumnRecorder>;
  extraConfig?: (self: unknown) => RtEntryRecorder[];
  buildTable: BuildTableFn;
  drizzle?: unknown;
}

/** Assemble the slim table object. Every column recorder learns its key and
 *  its owning table here (what reference resolution traverses later). */
export function createRtTable(
  name: string,
  columns: Record<string, unknown>,
  extraConfig: ((self: never) => unknown[]) | undefined,
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
  return table as never;
}

/** Materialize (once) the real drizzle table: traverse the recorded graph,
 *  build every column via its own toDrizzleColumn, and hand drizzle the
 *  extraConfig replay when the slim table recorded one. Memoized on the table;
 *  every call returns the same drizzle table object. */
export function materializeRtTable(table: object, context: DrizzleContext): unknown {
  const runtime = (table as Record<symbol, RtTableRuntime | undefined>)[rtTableKey];
  if (!runtime) throw new Error('@mionjs/drizzle-orm: toDrizzle() called on a value that is not a slim table');
  if (runtime.drizzle !== undefined) return runtime.drizzle;
  const columnBuilders: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(runtime.columns)) columnBuilders[key] = column.toDrizzleColumn(context);
  const extraConfigReplay = runtime.extraConfig
    ? (dzExtraColumns: Record<string, unknown>) =>
        runtime.extraConfig!(table as never).map((entry) => entry.toDrizzleEntry(context, {table, columns: dzExtraColumns}))
    : undefined;
  runtime.drizzle = runtime.buildTable(context, runtime.name, columnBuilders, extraConfigReplay);
  return runtime.drizzle;
}

// Recorded-argument resolution (registered into recorder.ts to break the
// module cycle): a slim column resolves through its OWN table's materialized
// drizzle table — except same-table refs inside an extraConfig replay, which
// resolve to the (index-capable) columns drizzle handed that callback.
setResolveRecorded((value, context, extra) => {
  if (value instanceof RtSqlRecorder) return value.toDrizzleSql(context, extra);
  if (value instanceof RtIndexedColumnClass) {
    const indexed = value as unknown as IndexedColumnInternal;
    let dzColumn = resolveColumn(indexed.column, context, extra) as Record<string, (...a: unknown[]) => unknown>;
    for (const {method, args} of indexed.calls) dzColumn = dzColumn[method](...args) as typeof dzColumn;
    return dzColumn;
  }
  if (value instanceof RtColumnRecorder) return resolveColumn(value, context, extra);
  return materializeRtTable(value as object, context);
});

function resolveColumn(column: RtColumnRecorder, context: DrizzleContext, extra?: ExtraConfigScope): unknown {
  if (!column.table) {
    throw new Error('@mionjs/drizzle-orm: a column was referenced before being placed in a table');
  }
  if (extra && column.table === extra.table) return extra.columns[column.key];
  const dzTable = materializeRtTable(column.table, context) as Record<string, unknown>;
  return dzTable[column.key];
}
