/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Slim VIEW core, the read-only sibling of table.ts. Covers drizzle's
// manual-column view form only: `pgView(name, columns).as(sql`...`)` and
// `.existing()`, plus the pre-terminal chain each dialect exposes (with /
// using / tablespace / withNoData on pg, algorithm / sqlSecurity /
// withCheckOption on mysql, none on sqlite).
//
// Drizzle's OTHER form, `pgView(name).as(qb => qb.select().from(users))`,
// deliberately stays on drizzle: its columns come from drizzle's select
// typing, which is the exact generic chain the slim design removes. Declare
// those with drizzle over toDrizzle() tables (packages/drizzle-orm/CLAUDE.md).
//
// A view is select-only: InferSelectModel accepts one, InferInsertModel and
// InferUpdateModel do not.

import type {AnyRtColumn, DrizzleContext} from './recorder.ts';
import {mapReplayArgs, RtColumnRecorder, rtViewBrand, rtViewKey} from './recorder.ts';
import {setViewMaterializer} from './table.ts';

/** A slim view's TYPE: the metadata, the same shape RtTableMeta takes and for
 *  the same reasons (see table.ts). Its own brand rather than the table's, so a
 *  view and a table stay distinguishable where toDrizzle overloads on them. */
export interface RtViewMeta<TName extends string, Cols> {
  name: TName;
  columns: Cols;
}
export type AnyRtView = RtViewMeta<string, Record<string, AnyRtColumn>>;
/** The view's brand, the twin of RtTableBrand (see table.ts for why it lives
 *  here rather than on RtViewMeta). */
export interface RtViewBrand<Dialect extends string> {
  readonly [rtViewBrand]?: Dialect;
}

export type ViewNameOf<V extends AnyRtView> = V['name'];
export type ViewColsOf<V extends AnyRtView> = V['columns'];

/** Builds the dialect's drizzle view builder at materialization: called with
 *  the context, the view name and the materialized column builders. What it
 *  returns is drizzle's ManualViewBuilder, which the chain and the terminal
 *  call then run against. */
export type BuildViewFn = (context: DrizzleContext, name: string, columnBuilders: Record<string, unknown>) => unknown;

interface RecordedViewCall {
  method: string;
  args: unknown[];
}

interface RtViewRuntime {
  name: string;
  columns: Record<string, RtColumnRecorder>;
  buildView: BuildViewFn;
  /** with / using / tablespace / withNoData / algorithm / ... , in call order. */
  chain: RecordedViewCall[];
  /** The call that finalizes the view: `as(sql)` or `existing()`. */
  terminal: RecordedViewCall;
  drizzle?: unknown;
}

/** The recorder a dialect's view factory returns: records the chain, and
 *  produces the slim view object on `as` / `existing`. Every chain method any
 *  dialect exposes lives here; which of them a view TYPE offers is decided by
 *  the dialect's view interfaces, so an inapplicable one is unreachable from
 *  typed code (the same split the column kind interfaces use). */
export class RtViewBuilder {
  private chain: RecordedViewCall[] = [];
  constructor(
    private name: string,
    private columns: Record<string, unknown>,
    private buildView: BuildViewFn
  ) {
    // Checked here, not at .as()/.existing(): a shared column builder is a
    // mistake at the call that reuses it, exactly as on the table road. The
    // columns are only CLAIMED on finalize, when the view object exists.
    for (const [key, column] of Object.entries(columns)) {
      if ((column as RtColumnRecorder).table !== undefined) throw sharedColumnError(key, name);
    }
  }
  private record(method: string, args: unknown[]): this {
    this.chain.push({method, args});
    return this;
  }
  with(config: unknown) {
    return this.record('with', [config]);
  }
  using(method: string) {
    return this.record('using', [method]);
  }
  tablespace(tablespace: string) {
    return this.record('tablespace', [tablespace]);
  }
  withNoData() {
    return this.record('withNoData', []);
  }
  algorithm(algorithm: unknown) {
    return this.record('algorithm', [algorithm]);
  }
  sqlSecurity(sqlSecurity: unknown) {
    return this.record('sqlSecurity', [sqlSecurity]);
  }
  withCheckOption(withCheckOption?: unknown) {
    return this.record('withCheckOption', withCheckOption === undefined ? [] : [withCheckOption]);
  }

  /** `.as(sql`...`)`: the view's query, as a recorded sql template. */
  as(query: unknown): never {
    return createRtView(this.name, this.columns, this.buildView, this.chain, {method: 'as', args: [query]});
  }
  /** `.existing()`: the view already exists, so drizzle-kit emits no CREATE. */
  existing(): never {
    return createRtView(this.name, this.columns, this.buildView, this.chain, {method: 'existing', args: []});
  }
}

function sharedColumnError(key: string, name: string): Error {
  return new Error(
    `@mionjs/drizzle-orm: column "${key}" of view "${name}" was already used in another table or view — column builders cannot be shared, create one per table or view`
  );
}

/** Assemble the slim view object. Mirrors createRtTable: every column recorder
 *  learns its key and its owning view, which is what reference resolution
 *  traverses when a view column is used somewhere else. */
function createRtView(
  name: string,
  columns: Record<string, unknown>,
  buildView: BuildViewFn,
  chain: RecordedViewCall[],
  terminal: RecordedViewCall
): never {
  const view = {...columns} as Record<string | symbol, unknown>;
  for (const [key, column] of Object.entries(columns)) {
    const recorder = column as RtColumnRecorder;
    if (recorder.table !== undefined) throw sharedColumnError(key, name);
    recorder.key = key;
    recorder.table = view;
  }
  const runtime: RtViewRuntime = {name, columns: columns as Record<string, RtColumnRecorder>, buildView, chain, terminal};
  view[rtViewKey] = runtime;
  return view as never;
}

/** Materialize (once) the real drizzle view: build every column, run the
 *  dialect's view factory, replay the chain, then the terminal call. Memoized
 *  on the view, exactly like materializeRtTable. */
export function materializeRtView(view: object, context: DrizzleContext): unknown {
  const runtime = (view as Record<symbol, RtViewRuntime | undefined>)[rtViewKey];
  if (!runtime) throw new Error('@mionjs/drizzle-orm: toDrizzle() called on a value that is not a slim view');
  if (runtime.drizzle !== undefined) return runtime.drizzle;
  const columnBuilders: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(runtime.columns)) columnBuilders[key] = column.toDrizzleColumn(context);
  let builder = runtime.buildView(context, runtime.name, columnBuilders) as Record<string, (...args: unknown[]) => unknown>;
  for (const {method, args} of runtime.chain) {
    builder = builder[method](...mapReplayArgs(args, context)) as typeof builder;
  }
  runtime.drizzle = builder[runtime.terminal.method](...mapReplayArgs(runtime.terminal.args, context));
  return runtime.drizzle;
}

/** Whether a value is a slim view (used by toDrizzle's dispatch and by the
 *  shared column resolution in table.ts). */
export function isRtView(value: object): boolean {
  return typeof (value as Record<symbol, unknown>)[rtViewKey] === 'object';
}

// Registered into table.ts so a table-only program never loads this module.
setViewMaterializer(materializeRtView);
