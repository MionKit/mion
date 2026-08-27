// STAGE-1 SPIKE of the slim drizzle-free builder core
// (docs/todos/drizzle-slim-builders.md). Hand-written minimal pg surface: three
// column builders (varchar / integer / timestamp), one index recorder, the slim
// pgTable, flat models + refine, and toDrizzle materialization. This file is
// measurement scaffolding for the lane in slimLane.compile.test.ts and the
// runtime-equality spec; the real implementation lands in @mionjs/drizzle-orm
// and the dialect packages (stages 2-4), where the drizzle namespace is
// injected instead of imported (optional peer).
//
// Design under test:
// - Authoring records calls at runtime only: every RtColumn carries its own
//   toDrizzleColumn(dz) materializer plus the modifier replay list. Nothing
//   about the table is embedded in the type system beyond Data + three flags.
// - Models are flat mapped types over the slim columns, reusing the standard
//   SelectModel/InsertModel/UpdateModel utilities from @ts-runtypes/core.
// - toDrizzle's return type SYNTHESIZES structural PgColumn configs (option
//   (a) of the spec). GetColumnData reads only data+notNull, and the insert
//   key mapping reads notNull/hasDefault/generated/identity, so a fixed
//   dataType/columnType satisfies the machinery; the spike's db-step budget
//   plus the shape pins prove it.

import type {Date as RTDate, Int32, String as Str, StringDateTime} from '@ts-runtypes/core/formats';
import type {MergeFormat, RefinableParamsOf} from '@ts-runtypes/core/formats';
import type {PgColumn, PgTableWithColumns} from 'drizzle-orm/pg-core';
// Spike-only static import: the real toDrizzle lives in its own module and is
// the single place that imports drizzle (optional peer).
import * as dzPg from 'drizzle-orm/pg-core';

type DzPg = typeof dzPg;
type Prettify<T> = {[K in keyof T]: T[K]} & {};

// ── Slim column types ────────────────────────────────────────────────────────

// The three model-relevant flags ride as SEPARATE boolean type params. An
// object-typed flags param measured within noise of this; the separate params
// stay because every consumer (models, synth config) indexes one flag directly
// with no helper conditional in between.
/** Phantom key for the column brand; never set at runtime. */
export const rtColumnKey: unique symbol = Symbol('rtColumn');
/** Runtime key the slim table stores its metadata under. */
export const rtTableKey: unique symbol = Symbol('rtTable');

/** Named brand every slim column interface extends (named so declaration emit
 *  can always reference it, per the FormatBrand lesson). NotNull / HasDefault /
 *  InsertExcluded (generatedAlwaysAs or identity-always) are all models need. */
export interface RtColumnBrand<Data, NotNull extends boolean, HasDefault extends boolean, InsertExcluded extends boolean> {
  readonly [rtColumnKey]?: {data: Data; notNull: NotNull; hasDefault: HasDefault; insertExcluded: InsertExcluded};
}
export type AnyRtColumn = RtColumnBrand<any, any, any, any>;

export type ColDataOf<C> = C extends RtColumnBrand<infer Data, any, any, any> ? Data : never;
type NotNullOf<C> = C extends RtColumnBrand<any, infer N, any, any> ? N : never;
type HasDefaultOf<C> = C extends RtColumnBrand<any, any, infer H, any> ? H : never;
type InsertExcludedOf<C> = C extends RtColumnBrand<any, any, any, infer X> ? X : never;

// Per-kind chain interfaces: each declares its own methods so chaining keeps
// the kind (drizzle's `.notNull().defaultNow()` order works). Spike carries
// three kinds; the real packages author one per column function.
export interface RtPgVarchar<Data, N extends boolean, H extends boolean, X extends boolean> extends RtColumnBrand<Data, N, H, X> {
  notNull(): RtPgVarchar<Data, true, H, X>;
  default(value: Data): RtPgVarchar<Data, N, true, X>;
  primaryKey(): RtPgVarchar<Data, true, H, X>;
  $type<T>(): RtPgVarchar<T, N, H, X>;
}
export interface RtPgInteger<Data, N extends boolean, H extends boolean, X extends boolean> extends RtColumnBrand<Data, N, H, X> {
  notNull(): RtPgInteger<Data, true, H, X>;
  default(value: Data): RtPgInteger<Data, N, true, X>;
  primaryKey(): RtPgInteger<Data, true, H, X>;
  $type<T>(): RtPgInteger<T, N, H, X>;
}
export interface RtPgTimestamp<Data, N extends boolean, H extends boolean, X extends boolean> extends RtColumnBrand<
  Data,
  N,
  H,
  X
> {
  notNull(): RtPgTimestamp<Data, true, H, X>;
  default(value: Data): RtPgTimestamp<Data, N, true, X>;
  defaultNow(): RtPgTimestamp<Data, N, true, X>;
  primaryKey(): RtPgTimestamp<Data, true, H, X>;
  $type<T>(): RtPgTimestamp<T, N, H, X>;
}

// ── Named type per column builder (the pure-types vocabulary) ────────────────

export type Varchar<L extends number | undefined = undefined> = L extends number ? Str<{maxLength: L}> : Str;
export type Integer = Int32;
export type Timestamp<Mode extends 'date' | 'string' = 'date'> = Mode extends 'date' ? RTDate : StringDateTime;

// ── Runtime recorder ─────────────────────────────────────────────────────────

interface ModCall {
  method: string;
  args: unknown[];
}

/** Runtime shape of every slim column: the materializer set by the builder
 *  that created it, plus the recorded modifier calls to replay. */
class RtColumnImpl {
  key = '';
  mods: ModCall[] = [];
  constructor(private init: (dz: DzPg) => unknown) {}
  toDrizzleColumn(dz: DzPg): unknown {
    let builder = this.init(dz) as Record<string, (...a: unknown[]) => unknown>;
    for (const mod of this.mods) builder = builder[mod.method](...mod.args) as typeof builder;
    return builder;
  }
  private record(method: string, args: unknown[]): this {
    this.mods.push({method, args});
    return this;
  }
  notNull() {
    return this.record('notNull', []);
  }
  default(value: unknown) {
    return this.record('default', [value]);
  }
  defaultNow() {
    return this.record('defaultNow', []);
  }
  primaryKey() {
    return this.record('primaryKey', []);
  }
  // Type-only in drizzle too: nothing to replay.
  $type() {
    return this;
  }
}

// ── Column builders (drizzle-identical call params) ──────────────────────────

export function varchar<TName extends string, L extends number | undefined = undefined>(
  name: TName,
  config?: {length?: L}
): RtPgVarchar<Varchar<L>, false, false, false> {
  return new RtColumnImpl((dz) => dz.varchar(name, config as never)) as unknown as RtPgVarchar<Varchar<L>, false, false, false>;
}

export function integer<TName extends string>(name: TName): RtPgInteger<Integer, false, false, false> {
  return new RtColumnImpl((dz) => dz.integer(name)) as unknown as RtPgInteger<Integer, false, false, false>;
}

export function timestamp<TName extends string, TMode extends 'date' | 'string' = 'date'>(
  name: TName,
  config?: {mode?: TMode; withTimezone?: boolean; precision?: number}
): RtPgTimestamp<Timestamp<TMode>, false, false, false> {
  return new RtColumnImpl((dz) => dz.timestamp(name, (config ?? {}) as never)) as unknown as RtPgTimestamp<
    Timestamp<TMode>,
    false,
    false,
    false
  >;
}

// ── Index recorder (spike: name + on()) ──────────────────────────────────────

export interface RtIndex {
  on(...columns: AnyRtColumn[]): RtIndex;
}
class RtIndexImpl {
  columns: RtColumnImpl[] = [];
  constructor(private name?: string) {}
  on(...columns: RtColumnImpl[]) {
    this.columns = columns;
    return this;
  }
  toDrizzleEntry(dz: DzPg, dzColumns: Record<string, unknown>) {
    const indexColumns = this.columns.map((column) => dzColumns[column.key]) as [never, ...never[]];
    return dz.index(this.name).on(...indexColumns);
  }
}
export function index(name?: string): RtIndex {
  return new RtIndexImpl(name) as unknown as RtIndex;
}

// ── Slim table ───────────────────────────────────────────────────────────────

export interface RtTableMeta<TName extends string, Cols> {
  name: TName;
  columns: Cols;
}
export type RtTable<TName extends string, Cols> = Cols & {readonly [rtTableKey]: RtTableMeta<TName, Cols>};
export type AnyRtTable = {readonly [rtTableKey]: RtTableMeta<string, Record<string, AnyRtColumn>>};

export type TableNameOf<T extends AnyRtTable> = T[typeof rtTableKey]['name'];
export type ColsOf<T extends AnyRtTable> = T[typeof rtTableKey]['columns'];

interface TableRuntimeMeta {
  name: string;
  columns: Record<string, RtColumnImpl>;
  extraConfig?: (self: unknown) => RtIndexImpl[];
  drizzle?: unknown;
}

export function pgTable<TName extends string, Cols extends Record<string, AnyRtColumn>>(
  name: TName,
  columns: Cols,
  extraConfig?: (self: RtTable<TName, Cols>) => RtIndex[]
): RtTable<TName, Cols> {
  const table = {...columns} as Record<string | symbol, unknown>;
  for (const [key, column] of Object.entries(columns)) (column as unknown as RtColumnImpl).key = key;
  const meta: TableRuntimeMeta = {
    name,
    columns: columns as unknown as Record<string, RtColumnImpl>,
    extraConfig: extraConfig as TableRuntimeMeta['extraConfig'],
  };
  table[rtTableKey] = meta;
  return table as RtTable<TName, Cols>;
}

// ── Flat models ──────────────────────────────────────────────────────────────

// Models computed in ONE mapped pass each, directly from the columns record.
// A RowOf intermediate routed through the standard SelectModel/InsertModel/
// UpdateModel utilities measured ~1.7x this shape across steps 1-3 (3609 vs
// 2147) and pushed the initClient control step to 3287 (vs 2541 here). The
// SEMANTICS are identical to those utilities and pinned by the shape pins;
// this deviation from the spec's "delegate to modelTypes.ts" is recorded in
// the todo doc.

type SelectOfCols<C> = {
  [K in keyof C]: NotNullOf<C[K]> extends true ? ColDataOf<C[K]> : ColDataOf<C[K]> | null;
};
type InsertOfCols<C> = {
  [K in keyof C as InsertExcludedOf<C[K]> extends true
    ? never
    : NotNullOf<C[K]> extends true
      ? HasDefaultOf<C[K]> extends true
        ? never
        : K
      : never]: ColDataOf<C[K]>;
} & {
  [K in keyof C as InsertExcludedOf<C[K]> extends true
    ? never
    : NotNullOf<C[K]> extends true
      ? HasDefaultOf<C[K]> extends true
        ? K
        : never
      : K]?: NotNullOf<C[K]> extends true ? ColDataOf<C[K]> : ColDataOf<C[K]> | null;
};
type UpdateOfCols<C> = {
  [K in keyof C as InsertExcludedOf<C[K]> extends true ? never : K]?: NotNullOf<C[K]> extends true
    ? ColDataOf<C[K]>
    : ColDataOf<C[K]> | null;
};

/** Row model of a (refined) slim table. */
export type InferSelect<T extends AnyRtTable> = Prettify<SelectOfCols<ColsOf<T>>>;
/** Insert payload: generated columns removed, defaulted ones optional. */
export type InferInsert<T extends AnyRtTable> = Prettify<InsertOfCols<ColsOf<T>>>;
/** Update payload: any subset of the insert payload. */
export type InferUpdate<T extends AnyRtTable> = Prettify<UpdateOfCols<ColsOf<T>>>;

// ── Refine (flat) ────────────────────────────────────────────────────────────

export type TableRefinements<T extends AnyRtTable> = {
  [K in keyof ColsOf<T>]?: RefinableParamsOf<ColDataOf<ColsOf<T>[K]>>;
};

/** Post-refine column: the brand alone (the table is already built, nothing
 *  chains after refineTableType). */
export type RtRefinedColumn<Data, N extends boolean, H extends boolean, X extends boolean> = RtColumnBrand<Data, N, H, X>;

type RefineCols<Cols, R> = {
  [K in keyof Cols]: K extends keyof R
    ? R[K] extends object
      ? Cols[K] extends RtColumnBrand<infer Data, infer N, infer H, infer X>
        ? RtRefinedColumn<MergeFormat<Data, R[K]>, N, H, X>
        : Cols[K]
      : Cols[K]
    : Cols[K];
};
export type RefinedTable<T extends AnyRtTable, R> = RtTable<TableNameOf<T>, RefineCols<ColsOf<T>, R>>;

/** Identity at runtime: the SAME table object retyped with merged params. */
export function refineTableType<T extends AnyRtTable, const R extends TableRefinements<T>>(
  table: T,
  refinements: R
): RefinedTable<T, R> {
  void refinements;
  return table as unknown as RefinedTable<T, R>;
}

// ── toDrizzle: lazy materialization + synthesized drizzle typing ─────────────

/** Structural PgColumn config from slim state. dataType/columnType are fixed:
 *  drizzle's model/query typing reads data, notNull, hasDefault, generated and
 *  identity only (operations.d.ts / GetColumnData). */
type SynthConfig<K extends string, TName extends string, Data, N extends boolean, H extends boolean, X extends boolean> = {
  name: K;
  tableName: TName;
  dataType: 'custom';
  columnType: 'RtColumn';
  data: Data;
  driverParam: unknown;
  enumValues: undefined;
  notNull: N;
  hasDefault: H;
  isPrimaryKey: false;
  isAutoincrement: false;
  hasRuntimeDefault: false;
  identity: undefined;
  generated: X extends true ? {type: 'always'} : undefined;
};

export type ToDrizzleTable<T extends AnyRtTable> = PgTableWithColumns<{
  name: TableNameOf<T>;
  schema: undefined;
  dialect: 'pg';
  columns: {
    [K in keyof ColsOf<T> & string]: PgColumn<
      SynthConfig<
        K,
        TableNameOf<T>,
        ColDataOf<ColsOf<T>[K]>,
        NotNullOf<ColsOf<T>[K]>,
        HasDefaultOf<ColsOf<T>[K]>,
        InsertExcludedOf<ColsOf<T>[K]>
      >
    >;
  };
}>;

/** Materialize (once) the real drizzle table by traversing the recorded graph:
 *  each column's own toDrizzleColumn builds its drizzle builder and replays the
 *  recorded modifiers; the extraConfig recorders convert against the built
 *  drizzle columns. Returns the same drizzle table on every call. */
export function toDrizzle<T extends AnyRtTable>(table: T): ToDrizzleTable<T> {
  const meta = (table as unknown as Record<symbol, TableRuntimeMeta>)[rtTableKey];
  if (meta.drizzle) return meta.drizzle as ToDrizzleTable<T>;
  const builders: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(meta.columns)) builders[key] = column.toDrizzleColumn(dzPg);
  meta.drizzle = meta.extraConfig
    ? dzPg.pgTable(
        meta.name,
        builders as never,
        (dzColumns: Record<string, unknown>) =>
          meta.extraConfig!(table).map((entry) => entry.toDrizzleEntry(dzPg, dzColumns)) as never
      )
    : dzPg.pgTable(meta.name, builders as never);
  return meta.drizzle as ToDrizzleTable<T>;
}
