/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The dialect-agnostic recorder core behind @mionjs/drizzle-orm-*-core: slim
// column objects that RECORD their creation and modifier calls at runtime and
// replay them 1:1 against the real drizzle functions when a table materializes
// (toDrizzle in the dialect package). Nothing here imports drizzle: every
// materializer receives the drizzle modules through a DrizzleContext injected
// by the dialect's toDrizzle module, which is what lets drizzle-orm be an
// OPTIONAL peer of the whole family.
//
// Type level, deliberately tiny: a column type carries its Data (a runtype
// format type) plus three booleans (notNull / hasDefault / insertExcluded).
// Everything else about a column lives only at runtime in the recorded calls,
// where toDrizzleColumn restores it (.claude/skills/drizzle-slim-schemas/ARCHITECTURE.md).

/** Phantom key for the column brand; never set at runtime. */
export const rtColumnKey: unique symbol = Symbol('rtColumn');
/** Runtime key a slim table stores its metadata under (see table.ts). */
export const rtTableKey: unique symbol = Symbol('rtTable');
/** Runtime key a slim VIEW stores its metadata under (see view.ts). */
export const rtViewKey: unique symbol = Symbol('rtView');
// The two keys above live on the VALUE and hold the recorded runtime state. The
// two below are TYPE-only brands on the metadata itself, carrying the dialect
// that recorded it: they are what makes a table (or view) recognisable in the
// reflected graph, and what makes another dialect's toDrizzle a compile error
// rather than a `dzMy.pgTable is not a function` at run time. Separate symbols
// on purpose — one key meaning "the runtime state" on a value and "I am a
// table" in a type would be one symbol doing two jobs.
/** Phantom key branding a table's metadata with its dialect; never set at runtime. */
export const rtTableBrand: unique symbol = Symbol('rtTableBrand');
/** Phantom key branding a view's metadata with its dialect; never set at runtime. */
export const rtViewBrand: unique symbol = Symbol('rtViewBrand');
/** Runtime key a standalone factory handle (enum/schema/sequence) stores its
 *  RtValueRecorder under, so the dialect's toDrizzle can materialize it. */
export const rtValueKey: unique symbol = Symbol('rtValue');

import type {FormatNameOf, NominalBrand} from '@ts-runtypes/core';

/** Named brand every slim column interface extends (named, so declaration emit
 *  can always print a reference to it instead of a bare symbol key). The three
 *  booleans are everything the model types need: NotNull, HasDefault, and
 *  InsertExcluded (generatedAlwaysAs / identity-always columns, which cannot
 *  appear in an insert payload). */
/** Sentinel key of the key-flag brand (see ColKeyFlags). */
export const rtColumnKeyFlagsKey: unique symbol = Symbol('rtColumnKeyFlags');

export interface RtColumnBrand<Data, NotNull extends boolean, HasDefault extends boolean, InsertExcluded extends boolean> {
  readonly [rtColumnKey]?: {data: Data; notNull: NotNull; hasDefault: HasDefault; insertExcluded: InsertExcluded};
}
export type AnyRtColumn = RtColumnBrand<any, any, any, any>;

/** The value type a column holds (the format-branded data type). */
export type ColDataOf<C> = C extends RtColumnBrand<infer Data, any, any, any> ? Data : never;
export type ColNotNullOf<C> = C extends RtColumnBrand<any, infer NotNull, any, any> ? NotNull : never;
export type ColHasDefaultOf<C> = C extends RtColumnBrand<any, any, infer HasDefault, any> ? HasDefault : never;
export type ColInsertExcludedOf<C> = C extends RtColumnBrand<any, any, any, infer Excluded> ? Excluded : never;
/** The WHOLE brand payload, read in one conditional. The four helpers above
 *  each cost their own, so a model that needs three of them pays three per
 *  column; the flat models read this instead and index into it. */
export type ColBrandOf<C> = C extends {readonly [rtColumnKey]?: infer Brand} ? NonNullable<Brand> : never;

/** The parts of drizzle's column config that the four core flags above cannot
 *  express, and that drizzle's own typing reads:
 *
 *  - mysql's `$returningId()` returns a key when the column is a primary key AND
 *    is either auto-incrementing or has a runtime default.
 *  - pg's `.overridingSystemValue()` re-admits an `identity: 'always'` column to
 *    an insert, and leaves a `generated` one out.
 *
 *  They live in their own optional brand rather than as more RtColumnBrand type
 *  parameters, so a column that carries none of them stays exactly as it was. */
export interface ColKeyFlags {
  primaryKey: boolean;
  autoincrement: boolean;
  runtimeDefault: boolean;
  identity: 'always' | 'byDefault' | undefined;
}
export type NoKeyFlags = {primaryKey: false; autoincrement: false; runtimeDefault: false; identity: undefined};
export interface RtColumnKeyBrand<Key extends ColKeyFlags> {
  readonly [rtColumnKeyFlagsKey]?: Key;
}
/** A column's key flags, from whichever road declared it: the builder road
 *  carries them in the brand above, the type road recovers them from the
 *  modifier calls it already records. */
export type ColKeyFlagsOf<C> = C extends RtColumnKeyBrand<infer Key> ? Key : NoKeyFlags;
/** Flip one boolean flag on, leaving the rest as they were. */
export type SetKeyFlag<Key extends ColKeyFlags, Flag extends 'primaryKey' | 'autoincrement' | 'runtimeDefault'> = {
  [F in keyof ColKeyFlags]: F extends Flag ? true : Key[F];
};
/** Record which kind of identity column this is. */
export type SetIdentity<Key extends ColKeyFlags, Kind extends 'always' | 'byDefault'> = {
  [F in keyof ColKeyFlags]: F extends 'identity' ? Kind : Key[F];
};

/** A column's data type with its runtype FORMAT tag dropped.
 *
 *  The slim column's data type carries the format the builder implies: `time()`
 *  is `StringTime`, i.e. `string & FormatBrand<'time', ...>`. That is what makes
 *  a slim schema double as a runtypes type, and it is right on the slim side. It
 *  is wrong on the drizzle side: `toDrizzle()` hands back a real drizzle table,
 *  and its rows should be exactly the rows drizzle's own table would give, or a
 *  migrated schema is not a drop-in replacement.
 *
 *  Dropping it costs nothing, because a plain format tag is TRANSPARENT: its
 *  sentinels are optional, so the tagged type and its base are mutually
 *  assignable. A queried row still goes into a slim-model slot and a slim model
 *  still goes into an insert.
 *
 *  A NOMINAL brand (`String<P, 'UserId'>`) is the one exception and is kept: its
 *  marker is REQUIRED, so a bare string is not assignable to it, and dropping it
 *  would stop a queried row going back into the model it came from.
 *
 *  Tuples are left alone: pg's `point({mode: 'tuple'})` is `[number, number]`,
 *  and mapping it as an array would flatten it to `number[]`. */
type LengthOf<T> = T extends {length: infer L} ? L : never;
type ElementOf<T> = T extends readonly (infer E)[] ? E : never;
export type PlainDataOf<T> = [T] extends [readonly unknown[]]
  ? number extends LengthOf<T>
    ? PlainDataOf<ElementOf<T>>[]
    : T
  : [FormatNameOf<T>] extends [never]
    ? T
    : [T] extends [NominalBrand<string>]
      ? T
      : [T] extends [Date]
        ? Date
        : [T] extends [string]
          ? string
          : [T] extends [number]
            ? number
            : [T] extends [bigint]
              ? bigint
              : T;

/** What a dialect's toDrizzle module injects into materialization: the dialect
 *  namespace module and the root drizzle-orm `sql` export. Typed loosely on
 *  purpose — this package never sees drizzle's types. */
export interface DrizzleContext {
  /** The dialect namespace (`drizzle-orm/pg-core`, `drizzle-orm/mysql-core`, ...). */
  ns: Record<string, (...args: never[]) => unknown>;
  /** The root `sql` export of drizzle-orm (tagged template + raw/join helpers). */
  sqlNs: SqlNamespace;
}
export interface SqlNamespace {
  (strings: TemplateStringsArray, ...values: unknown[]): unknown;
  raw(query: string): unknown;
}

interface RecordedCall {
  method: string;
  args: unknown[];
}

// ── sql recorder ─────────────────────────────────────────────────────────────

/** Opaque type of a recorded sql template (accepted wherever drizzle accepts
 *  SQL in the authoring surface: defaults, checks, generated columns, index
 *  where-clauses). */
export interface RtSql {
  readonly [rtColumnKey]?: {rtSql: true};
}

export class RtSqlRecorder {
  constructor(
    readonly strings: TemplateStringsArray | undefined,
    readonly values: unknown[],
    readonly rawText?: string
  ) {}
  toDrizzleSql(context: DrizzleContext, extra?: ExtraConfigScope): unknown {
    if (this.rawText !== undefined) return context.sqlNs.raw(this.rawText);
    return context.sqlNs(this.strings as TemplateStringsArray, ...mapRecordedArgs(this.values, context, extra));
  }
}

/** Drop-in recorder for drizzle-orm's `sql` tagged template. Embedded values
 *  may include slim columns and slim tables; they are resolved to the real
 *  drizzle objects at materialization. */
export function sql(strings: TemplateStringsArray, ...values: unknown[]): RtSql {
  return new RtSqlRecorder(strings, values) as unknown as RtSql;
}
sql.raw = (query: string): RtSql => new RtSqlRecorder(undefined, [], query) as unknown as RtSql;

// ── column recorder ──────────────────────────────────────────────────────────

/** A column reference decorated for an index position (`t.name.asc()` inside
 *  extraConfig). Produced WITHOUT touching the column's own recorded calls. */
export interface RtIndexedColumn {
  readonly [rtColumnKey]?: {rtIndexedColumn: true};
  asc(): RtIndexedColumn;
  desc(): RtIndexedColumn;
  nullsFirst(): RtIndexedColumn;
  nullsLast(): RtIndexedColumn;
  op(op: string): RtIndexedColumn;
}
class RtIndexedColumnImpl {
  calls: RecordedCall[] = [];
  constructor(readonly column: RtColumnRecorder) {}
  private chain(method: string, args: unknown[]) {
    this.calls.push({method, args});
    return this;
  }
  asc() {
    return this.chain('asc', []);
  }
  desc() {
    return this.chain('desc', []);
  }
  nullsFirst() {
    return this.chain('nullsFirst', []);
  }
  nullsLast() {
    return this.chain('nullsLast', []);
  }
  op(op: string) {
    return this.chain('op', [op]);
  }
}

/** The extraConfig view of a column: only the index-position decorators.
 *  Runtime objects are the recorders themselves, which carry these methods. */
export type RtExtraColumn = RtIndexedColumn;

/** Runtime shape of every slim column: the `init` materializer set by the
 *  column function that created it (receiving the DrizzleContext), plus the
 *  recorded modifier calls toDrizzleColumn replays in order. */
export class RtColumnRecorder {
  /** Key in the owning table's columns record; set by createRtTable. */
  key = '';
  /** The owning slim table object; set by createRtTable. */
  table: object | undefined;
  private mods: RecordedCall[] = [];
  constructor(private init: (context: DrizzleContext) => unknown) {}

  /** Build the drizzle column builder: run init, then replay every recorded
   *  modifier. Top-level function args (the lazy-callback idiom: references,
   *  generatedAlwaysAs(() => sql), $defaultFn) are wrapped so whatever they
   *  return is resolved to its drizzle counterpart when drizzle finally calls
   *  them — by which time the tables involved are materialized and cached. */
  toDrizzleColumn(context: DrizzleContext): unknown {
    let builder = this.init(context) as Record<string, (...args: unknown[]) => unknown>;
    for (const {method, args} of this.mods) {
      builder = builder[method](...mapReplayArgs(args, context)) as typeof builder;
    }
    return builder;
  }

  protected record(method: string, args: unknown[]): this {
    this.mods.push({method, args});
    return this;
  }

  // The modifier chain across all dialects. Every method is a pure recorder;
  // which of them a given column TYPE exposes is decided by the dialect's kind
  // interfaces, so an inapplicable one can never be called from typed code.
  notNull() {
    return this.record('notNull', []);
  }
  default(value: unknown) {
    return this.record('default', [value]);
  }
  $default(fn: unknown) {
    return this.record('$default', [fn]);
  }
  $defaultFn(fn: unknown) {
    return this.record('$defaultFn', [fn]);
  }
  $onUpdate(fn: unknown) {
    return this.record('$onUpdate', [fn]);
  }
  $onUpdateFn(fn: unknown) {
    return this.record('$onUpdateFn', [fn]);
  }
  primaryKey(...args: unknown[]) {
    return this.record('primaryKey', args);
  }
  unique(...args: unknown[]) {
    return this.record('unique', args);
  }
  references(ref: unknown, actions?: unknown) {
    return this.record('references', actions === undefined ? [ref] : [ref, actions]);
  }
  generatedAlwaysAs(as: unknown) {
    return this.record('generatedAlwaysAs', [as]);
  }
  generatedAlwaysAsIdentity(sequence?: unknown) {
    return this.record('generatedAlwaysAsIdentity', sequence === undefined ? [] : [sequence]);
  }
  generatedByDefaultAsIdentity(sequence?: unknown) {
    return this.record('generatedByDefaultAsIdentity', sequence === undefined ? [] : [sequence]);
  }
  array(size?: number) {
    return this.record('array', size === undefined ? [] : [size]);
  }
  defaultNow() {
    return this.record('defaultNow', []);
  }
  defaultRandom() {
    return this.record('defaultRandom', []);
  }
  autoincrement() {
    return this.record('autoincrement', []);
  }
  onUpdateNow() {
    return this.record('onUpdateNow', []);
  }
  // Type-only in drizzle too: nothing to replay.
  $type() {
    return this;
  }

  // Index-position decorators: produce a detached ref, never a recorded mod.
  asc() {
    return new RtIndexedColumnImpl(this).asc();
  }
  desc() {
    return new RtIndexedColumnImpl(this).desc();
  }
  nullsFirst() {
    return new RtIndexedColumnImpl(this).nullsFirst();
  }
  nullsLast() {
    return new RtIndexedColumnImpl(this).nullsLast();
  }
  op(op: string) {
    return new RtIndexedColumnImpl(this).op(op);
  }
}

// ── table-entry recorder (extraConfig helpers + standalone factories) ────────

/** Runtime recorder behind index/uniqueIndex/unique/foreignKey/primaryKey/
 *  check/policy/... helpers: the creating call plus its chained calls, replayed
 *  against the dialect namespace at materialization. */
export class RtEntryRecorder {
  private calls: RecordedCall[] = [];
  constructor(
    private fnName: string,
    private args: unknown[]
  ) {}
  protected record(method: string, args: unknown[]): this {
    this.calls.push({method, args});
    return this;
  }
  on(...args: unknown[]) {
    return this.record('on', args);
  }
  onOnly(...args: unknown[]) {
    return this.record('onOnly', args);
  }
  using(...args: unknown[]) {
    return this.record('using', args);
  }
  concurrently() {
    return this.record('concurrently', []);
  }
  where(condition: unknown) {
    return this.record('where', [condition]);
  }
  with(config: unknown) {
    return this.record('with', [config]);
  }
  onDelete(action: unknown) {
    return this.record('onDelete', [action]);
  }
  onUpdate(action: unknown) {
    return this.record('onUpdate', [action]);
  }
  nullsNotDistinct() {
    return this.record('nullsNotDistinct', []);
  }
  algorithm(algorithm: unknown) {
    return this.record('algorithm', [algorithm]);
  }
  lock(lock: unknown) {
    return this.record('lock', [lock]);
  }
  /** pgPolicy(...).link(table): attaches the policy to a table it does NOT sit
   *  in the extraConfig of. Such a policy materializes on its own, through
   *  toDrizzle(policy), not through the owning table. */
  link(table: unknown) {
    return this.record('link', [table]);
  }

  /** Replay against the dialect namespace. `extra`, when given, identifies the
   *  table currently materializing plus the record drizzle passed to ITS
   *  extraConfig callback, so same-table column refs resolve to those
   *  (index-capable) columns instead of re-materializing the table. */
  toDrizzleEntry(context: DrizzleContext, extra?: ExtraConfigScope): unknown {
    let entry = context.ns[this.fnName](...(mapReplayArgs(this.args, context, extra) as never[])) as Record<
      string,
      (...args: unknown[]) => unknown
    >;
    for (const {method, args} of this.calls) {
      entry = entry[method](...mapReplayArgs(args, context, extra)) as typeof entry;
    }
    return entry;
  }
}

/** Memoized recorder for standalone dialect factories that produce a VALUE the
 *  schema references (pgEnum, pgSchema, pgSequence, ...). With a `base`, the
 *  call replays as a METHOD on the base's materialized value instead of a
 *  namespace function (`pgSchema(...).enum(...)`). */
export class RtValueRecorder {
  private materialized: unknown;
  private calls: RecordedCall[] = [];
  constructor(
    private fnName: string,
    private args: unknown[],
    private base?: RtValueRecorder
  ) {}
  /** Record a chained call on the handle itself (pgRole(...).existing()). */
  record(method: string, args: unknown[]): this {
    this.calls.push({method, args});
    return this;
  }
  toDrizzleValue(context: DrizzleContext): unknown {
    if (this.materialized === undefined) {
      const mappedArgs = mapRecordedArgs(this.args, context) as never[];
      let value = this.base
        ? (this.base.toDrizzleValue(context) as Record<string, (...a: never[]) => unknown>)[this.fnName](...mappedArgs)
        : context.ns[this.fnName](...mappedArgs);
      for (const {method, args} of this.calls) {
        value = (value as Record<string, (...a: unknown[]) => unknown>)[method](...mapRecordedArgs(args, context));
      }
      this.materialized = value;
    }
    return this.materialized;
  }
}

// ── recorded-argument resolution ─────────────────────────────────────────────

/** The extraConfig replay scope: WHICH table is materializing and the columns
 *  drizzle handed its extraConfig callback. */
export interface ExtraConfigScope {
  table: object;
  columns: Record<string, unknown>;
}

/** Resolve one recorded value to its drizzle counterpart. Set by table.ts to
 *  break the module cycle (resolving a column materializes its table). */
export let resolveRecorded: (value: unknown, context: DrizzleContext, extra?: ExtraConfigScope) => unknown = () => {
  throw new Error('@mionjs/drizzle-orm internal: resolveRecorded not initialized');
};
export function setResolveRecorded(resolver: typeof resolveRecorded): void {
  resolveRecorded = resolver;
}

/** Deep-map recorded args, replacing slim columns / indexed refs / sql
 *  recorders / slim tables with their materialized drizzle counterparts.
 *  Arrays and plain objects are walked; everything else passes through. */
export function mapRecordedArgs(args: unknown[], context: DrizzleContext, extra?: ExtraConfigScope): unknown[] {
  return args.map((arg) => mapRecordedArg(arg, context, extra));
}

/** mapRecordedArgs plus the lazy-callback wrap: a TOP-LEVEL function arg is
 *  replaced by a wrapper that maps its return value at call time. */
export function mapReplayArgs(args: unknown[], context: DrizzleContext, extra?: ExtraConfigScope): unknown[] {
  return args.map((arg) =>
    typeof arg === 'function'
      ? (...callArgs: unknown[]) => mapRecordedArg((arg as (...a: unknown[]) => unknown)(...callArgs), context, extra)
      : mapRecordedArg(arg, context, extra)
  );
}

function mapRecordedArg(value: unknown, context: DrizzleContext, extra?: ExtraConfigScope): unknown {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value;
  if (value instanceof RtColumnRecorder || value instanceof RtIndexedColumnImpl || value instanceof RtSqlRecorder) {
    return resolveRecorded(value, context, extra);
  }
  // A factory handle (enum/schema/sequence/role) materializes through its own
  // attached value recorder.
  const attached = (value as Record<symbol, unknown>)[rtValueKey];
  if (attached instanceof RtValueRecorder) return attached.toDrizzleValue(context);
  if (typeof value === 'function') return value;
  const asRecord = value as Record<symbol, unknown>;
  if (typeof asRecord[rtTableKey] === 'object' || typeof asRecord[rtViewKey] === 'object') {
    return resolveRecorded(value, context, extra);
  }
  if (Array.isArray(value)) return value.map((item) => mapRecordedArg(item, context, extra));
  if (Object.getPrototypeOf(value) === Object.prototype) {
    const mapped: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) mapped[key] = mapRecordedArg(item, context, extra);
    return mapped;
  }
  return value;
}

/** Internal view of RtIndexedColumnImpl for table.ts. */
export interface IndexedColumnInternal {
  column: RtColumnRecorder;
  calls: RecordedCall[];
}
export const RtIndexedColumnClass = RtIndexedColumnImpl;
