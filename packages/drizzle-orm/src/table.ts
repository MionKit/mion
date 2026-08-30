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
  rtTableBrand,
  rtTableKey,
  rtViewKey,
  setResolveRecorded,
  type IndexedColumnInternal,
} from './recorder.ts';

/** A slim table's TYPE: the metadata, and nothing wrapped around it.
 *
 *  This is a type-level DESCRIPTOR of the table, not a mirror of the runtime
 *  object. The object createRtTable returns still carries the columns as
 *  properties and its recorded state under rtTableKey, because
 *  `extraConfig((t) => [index().on(t.name)])` and `references(() => teams.id)`
 *  read those at run time. The type says only what every reader needs, which is
 *  this: the name, the columns, the extraConfig tuple, and which dialect
 *  recorded it.
 *
 *  Which dialect recorded it rides the separate RtTableBrand below, which each
 *  dialect's own table interface extends.
 *
 *  Reach for the columns with ColsOf on the type, or cols() on the value. */
export interface RtTableMeta<TName extends string, Cols, Extras extends readonly object[] = []> {
  name: TName;
  columns: Cols;
  extras: Extras;
}
/** Any slim table, of any dialect: the dialect-agnostic constraint the models
 *  and refineTableType take. */
export type AnyRtTable = RtTableMeta<string, Record<string, AnyRtColumn>, readonly object[]>;
/** The brand each DIALECT adds to its own table interface: what marks a node a
 *  table in the reflected graph, and what carries the dialect that recorded it.
 *
 *  It is what stops a table reaching another dialect's toDrizzle:
 *  materialization replays the table's OWN captured buildTable closure against
 *  whatever context it is handed, so a pg table run through mysql's toDrizzle
 *  used to reach for `context.ns.pgTable` and find nothing. Optional, the house
 *  sentinel convention, and it still rejects that call since `'pg' | undefined`
 *  is not assignable to `'mysql' | undefined`.
 *
 *  It lives on the dialect interfaces and not on RtTableMeta, and it is a fixed
 *  member rather than a type parameter, because both of those cost: a parameter
 *  the checker instantiates per declared table measured at about 4 each, and
 *  declaring it in core AND narrowing it in the dialect at about 9. */
export interface RtTableBrand<Dialect extends string> {
  readonly [rtTableBrand]?: Dialect;
}

export type TableNameOf<T extends AnyRtTable> = T['name'];
export type ColsOf<T extends AnyRtTable> = T['columns'];

/** The columns of a slim table, as a VALUE. Identity at run time: the object
 *  really does carry them as properties, the type just does not name them.
 *  This is how a cross-table reference is written:
 *
 *    teamId: integer('team_id').references(() => cols(teams).id) */
export function cols<T extends AnyRtTable>(table: T): ColsOf<T> {
  return table as unknown as ColsOf<T>;
}

/** Builds the dialect's drizzle table at materialization: called with the
 *  context, the materialized column builders, and (when the slim table has an
 *  extraConfig) a replay callback shaped for drizzle's third argument. */
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

/** Assemble the slim table object. Every column recorder learns its key and
 *  its owning table here (what reference resolution traverses later). */
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
  // Attached on both roads (this is where the type road's bridge builds its
  // table too), so a dialect that TYPES enableRLS always has it at runtime;
  // dialects whose drizzle table has no enableRLS simply never declare it.
  // Non-enumerable, and never over a real column of that name.
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
    ? (dzExtraColumns: Record<string, unknown>) => {
        // A REAL drizzle entry (what the provider helpers such as
        // drizzle-orm/neon's crudPolicy return) passes through untouched: it is
        // already the object drizzle wants, and it has nothing to replay.
        const replay = (entry: unknown) =>
          entry instanceof RtEntryRecorder ? entry.toDrizzleEntry(context, {table, columns: dzExtraColumns}) : entry;
        const entries = runtime.extraConfig!(table as never);
        // drizzle still accepts its LEGACY object form (`(t) => ({idx: index()})`)
        // alongside the array one, and its own suites use both, so the shape has
        // to survive: drizzle reads the keys of an object form. An array is
        // flattened one level first, exactly as drizzle does (`extraConfig.flat(1)`),
        // or a grouped entry would reach it as a bare array of recorders.
        if (Array.isArray(entries)) return entries.flat(1).map(replay);
        return Object.fromEntries(Object.entries(entries).map(([key, entry]) => [key, replay(entry)]));
      }
    : undefined;
  const built = runtime.buildTable(context, runtime.name, columnBuilders, extraConfigReplay);
  runtime.drizzle = runtime.rls ? (built as {enableRLS(): unknown}).enableRLS() : built;
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
  return materializeOwner(value as object, context);
});

/** view.ts registers its materializer here at load (the same inversion
 *  recorder.ts uses for resolveRecorded). Keeping the import out of this
 *  module means a program that never declares a view never pulls the view
 *  types in, which the type budget measures. */
let materializeView: ((view: object, context: DrizzleContext) => unknown) | undefined;
export function setViewMaterializer(materializer: typeof materializeView): void {
  materializeView = materializer;
}

/** A recorded table-or-view reference materializes through its own kind. */
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
