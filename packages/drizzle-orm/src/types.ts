/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The type vocabulary the core modules and the dialect packages share.

import type {FormatNameOf, NominalBrand} from '@mionjs/run-types';
import type {rtColNameKey, rtColSpecKey, rtEntrySpecKey, rtNamedColumnKey, rtSqlTextKey} from './columns.ts';
import type {RtColumnRecorder, rtColumnKey, rtTableBrand, rtViewBrand} from './recorder.ts';

// ── Column types ─────────────────────────────────────────────────────────────
// A column type is ONE optional sentinel {fn, raw props, data} with no db name and no owner, so one column
// shape is one shared type in every table. Flags are derived lazily from the raw props, never at declaration.

/** The intrinsic flag names a builder may declare (serial-likes, sqlite rowid, mysql serial). */
export type ColBaseFlag = 'notNull' | 'hasDefault' | 'primaryKeyHasDefault' | 'autoincrement';

/** A props constraint that also rejects stray keys: a `const` type parameter gets no excess-property check. */
export type Only<P, Allowed> = {[K in keyof P]: K extends keyof Allowed ? Allowed[K] : never};

/** Props of a column with no config and no modifier. */
export type NoProps = Record<never, never>;

/** Named, so declaration emit prints a reference. */
export interface Column<Fn extends string, Props, Data, Base extends ColBaseFlag = never> {
  readonly [rtColSpecKey]?: {fn: Fn; config: Props; data: Data; base: Base};
}
/** What a named builder returns; the table lifts the name into its names map. A nameless one returns the column. */
export interface NamedColumn<Name extends string, C> {
  readonly [rtColNameKey]: Name;
  readonly [rtNamedColumnKey]: C;
}
export type AnyColumn = {readonly [rtColSpecKey]?: {fn: string; config: any; data: any; base: any}};

/** The spec payload of a column, `never` for a non-column. */
export type ColSpecOf<C> = C extends {readonly [rtColSpecKey]?: infer Spec} ? NonNullable<Spec> : never;

/** Props merged, flat so the result equals a hand-written object. */
export type Merge<Props, Mod> = {[K in keyof (Props & Mod)]: (Props & Mod)[K]};

/** Strip `readonly` from a const-inferred config so it equals the hand-written object. */
// `$type` is left alone: its tuple holds a caller's type (a nominal brand, a class), which a mapped type would flatten.
export type Writable<T> = {
  -readonly [K in keyof T]: K extends '$type' ? T[K] : T[K] extends readonly unknown[] ? MutableTuple<T[K]> : T[K];
};
// Its own alias: only a mapped type over a bare type parameter maps a tuple to a tuple.
type MutableTuple<A> = {
  -readonly [I in keyof A]: A[I] extends (...args: never[]) => unknown
    ? A[I]
    : A[I] extends object
      ? {-readonly [P in keyof A[I]]: A[I][P]}
      : A[I];
};

// ── A builder's props object ─────────────────────────────────────────────────
// A no-argument modifier is `true`, one with arguments its tuple, so builder props ARE the recorded props.
// Only function keys change, since no type spells a function: references() records its TableRef, a callback `true`.

/** The props keys that carry functions at run time. */
type RuntimeModKeys = 'references' | '$default' | '$defaultFn' | '$onUpdate' | '$onUpdateFn';
type RefArgs<Args> = Args extends readonly [() => infer Target, infer Actions]
  ? [Target, {-readonly [K in keyof Actions]: Actions[K]}]
  : Args extends readonly [() => infer Target]
    ? [Target]
    : never;
/** The props a column type records for the props a builder was called with. */
export type PropsOf<C> = [keyof C & RuntimeModKeys] extends [never]
  ? Writable<C>
  : {
      -readonly [K in keyof C]: K extends 'references'
        ? RefArgs<C[K]>
        : K extends RuntimeModKeys
          ? true
          : K extends '$type'
            ? C[K]
            : C[K] extends readonly unknown[]
              ? MutableTuple<C[K]>
              : C[K];
    };

// ── Lazy flag derivation, read only by the models and ToDrizzleTable ─────────
// Key tests intersect key unions: an Extract over keyof Props is a distributive conditional paid once per key.

type NotNullKeys = 'notNull' | 'primaryKey' | 'generatedAlwaysAsIdentity' | 'generatedByDefaultAsIdentity';
// Mirrors the builders: generated and identity columns carry a default, so they are never required on insert.
type DefaultKeys =
  | 'default'
  | 'defaultNow'
  | 'defaultRandom'
  | 'generatedAlwaysAs'
  | 'generatedAlwaysAsIdentity'
  | 'generatedByDefaultAsIdentity'
  | 'autoincrement'
  | 'onUpdateNow'
  | '$default'
  | '$defaultFn'
  | '$onUpdate'
  | '$onUpdateFn';
type ExcludedKeys = 'generatedAlwaysAs' | 'generatedAlwaysAsIdentity';

export type IsNotNull<Props, Base> = [(keyof Props & NotNullKeys) | (Base & 'notNull')] extends [never] ? false : true;
export type IsHasDefault<Props, Base> = [(keyof Props & DefaultKeys) | (Base & 'hasDefault')] extends [never]
  ? Props extends {primaryKey: readonly [{autoIncrement: true}]}
    ? true
    : [Base & 'primaryKeyHasDefault'] extends [never]
      ? false
      : [keyof Props & 'primaryKey'] extends [never]
        ? false
        : true
  : true;
export type IsInsertExcluded<Props> = [keyof Props & ExcludedKeys] extends [never] ? false : true;

/** The value a column holds: `$type` overrides the data, `array` wraps it. */
export type ValueOf<Props, Data> = [keyof Props & ('$type' | 'array')] extends [never]
  ? Data
  : Props extends {$type: [infer Override]}
    ? 'array' extends keyof Props
      ? Override[]
      : Override
    : Data[];

/** The select value from a spec's parts, with a fast path for columns with no `$type` and no `array`. */
export type SelectValue<Props, Data, Base> = [keyof Props & ('$type' | 'array')] extends [never]
  ? [(keyof Props & NotNullKeys) | (Base & 'notNull')] extends [never]
    ? Data | null
    : Data
  : IsNotNull<Props, Base> extends true
    ? ValueOf<Props, Data>
    : ValueOf<Props, Data> | null;

/** The primary-key default (sqlite's rowid, autoIncrement) only counts on a primary-key column. */
export type InsertKind<Props, Base> = [keyof Props & ExcludedKeys] extends [never]
  ? [(keyof Props & NotNullKeys) | (Base & 'notNull')] extends [never]
    ? 'optional'
    : [(keyof Props & DefaultKeys) | (Base & 'hasDefault')] extends [never]
      ? [keyof Props & 'primaryKey'] extends [never]
        ? 'required'
        : [Base & 'primaryKeyHasDefault'] extends [never]
          ? Props extends {primaryKey: readonly [{autoIncrement: true}]}
            ? 'optional'
            : 'required'
          : 'optional'
      : 'optional'
  : 'excluded';

type Has<Props, Keys extends string> = [keyof Props & Keys] extends [never] ? false : true;
/** The key flags drizzle's mysql `$returningId()` and pg `overridingSystemValue()` read. */
export type KeyFlagsOf<Spec> = Spec extends {config: infer Props; base: infer Base}
  ? {
      primaryKey: Has<Props, 'primaryKey'>;
      autoincrement: [Base & 'autoincrement'] extends [never] ? Has<Props, 'autoincrement'> : true;
      runtimeDefault: Has<Props, '$default' | '$defaultFn'>;
      identity: Has<Props, 'generatedAlwaysAsIdentity'> extends true
        ? 'always'
        : Has<Props, 'generatedByDefaultAsIdentity'> extends true
          ? 'byDefault'
          : undefined;
    }
  : never;

/** Literal sql, TEXT only: an interpolated template has no type spelling and stays builders-only. */
export interface Sql<Text extends string> {
  readonly [rtSqlTextKey]?: {sql: Text};
}

/** A `references` target in a column type: the table by db name, the column by record key (what TableRef spells). */
export interface ColRef {
  table: string;
  column: string;
}

/** Every modifier a column type can spell; each dialect Picks its subset per builder kind, so a stray one is an error. */
export interface ColMods {
  notNull?: true;
  /** `true` mirrors `.primaryKey()`; sqlite's `[{autoIncrement: true}]` mirrors `.primaryKey(config)`. */
  primaryKey?: true | readonly [unknown];
  default?: readonly [unknown];
  defaultRandom?: true;
  defaultNow?: true;
  unique?: true | readonly [string] | readonly [string, unknown];
  /** The VALUE form only; sql expressions and callbacks stay builders-only. */
  generatedAlwaysAs?: readonly [unknown];
  generatedAlwaysAsIdentity?: true | readonly [unknown];
  generatedByDefaultAsIdentity?: true | readonly [unknown];
  /** mysql. */
  autoincrement?: true;
  /** mysql. */
  onUpdateNow?: true;
  /** `.array(size?)`. */
  array?: true | readonly [number];
  references?: readonly [ColRef] | readonly [ColRef, unknown];
  /** `$type<T>()`, drizzle's type-only override; never replayed. Mutable, the tuple `$type<T>()` returns. */
  $type?: [unknown];
  // Runtime callbacks have no type spelling: the type records `true`, tableFromType's options.runtime carries the callback.
  $default?: true;
  $defaultFn?: true;
  $onUpdate?: true;
  $onUpdateFn?: true;
}

// ── Table-level entries (the extraConfig road) ───────────────────────────────

// In args and chain: own column `{col: key}`, another table's `{table: dbName, col: key}`, literal sql `Sql<'...'>`.
/** One table-level entry, replayed as `ns[fn](...args)` then each chain call; chain values encode like modifiers. */
export interface TableEntry<
  Fn extends string,
  Args extends readonly unknown[] = [],
  Chain extends object = Record<never, never>,
> {
  readonly [rtEntrySpecKey]?: {fn: Fn; args: Args; chain: Chain};
}

/** Map record keys onto self-column refs (the per-helper aliases' plumbing). */
export type EntryColRefs<Keys extends readonly string[]> = {[I in keyof Keys]: {col: Keys[I]}};

/** A builders record's columns: each named result unwrapped to its column. */
export type LiftCols<Cols> = {[K in keyof Cols]: Cols[K] extends {readonly [rtNamedColumnKey]: infer C} ? C : Cols[K]};
/** The db name a named builder result carries, `undefined` for a nameless one. */
export type NameOf<C> = C extends {readonly [rtColNameKey]: infer Name} ? Name : undefined;

// ── Tables and views ─────────────────────────────────────────────────────────

/** A table's type: name, the shared column types, extras, and the db names that differ from the key. */
export interface RtTableMeta<Name extends string, Cols, Extras extends readonly object[] = [], Names = NoNames> {
  name: Name;
  columns: Cols;
  extras: Extras;
  names: Names;
}
/** The names map of a table whose every db name is its record key. */
export type NoNames = Record<never, never>;
export type AnyTable = RtTableMeta<string, Record<string, AnyColumn>, readonly object[], object>;

/** The db name of one column of a table or view: the names map entry, else the record key. */
export type DbNameOf<T extends {names: object}, K extends string> = K extends keyof T['names'] ? T['names'][K] & string : K;

/** A reference to one column of another table, as plain data. Takes a table name for a self-reference. */
export type TableRef<T extends RefTable | string, K extends RefKeyOf<T>> = T extends string
  ? {table: T; column: K}
  : {table: (T & RefTable)['name']; column: K};
// Only what the ref reads: checking a table against AnyTable walks all its columns.
type RefTable = {name: string; columns: object};
type RefKeyOf<T> = T extends string ? string : keyof (T & RefTable)['columns'] & string;
export type AnyTableRef = ColRef;
/** An entry's column: the table's own, or a tableRef() when the entry is declared outside the table. */
export type EntryColumn = AnyColumn | AnyTableRef;

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

/** A view's type: the table meta minus extras, since a view has none. */
export interface RtViewMeta<Name extends string, Cols, Names = NoNames> {
  name: Name;
  columns: Cols;
  names: Names;
}

/** The twin of RtTableBrand (see RtTableBrand for why it is not on RtViewMeta). */
export interface RtViewBrand<Dialect extends string> {
  readonly [rtViewBrand]?: Dialect;
}

/** Builds the dialect's drizzle view builder at materialization; returns drizzle's
 *  ManualViewBuilder, which the chain and the terminal call then run against. */
export type BuildViewFn = (context: DrizzleContext, name: string, columnBuilders: Record<string, unknown>) => unknown;

// ── Recording and replay ─────────────────────────────────────────────────────

/** A column's data type with its runtype FORMAT tag dropped. Right on the slim side, where the tag
 *  makes a schema double as a runtypes type; wrong on the drizzle side, where toDrizzle()'s rows must
 *  be exactly drizzle's own or a migrated schema is not a drop-in replacement. Dropping it costs
 *  nothing: a plain format tag is TRANSPARENT (optional sentinels, so tagged type and base are
 *  mutually assignable). A NOMINAL brand (`String<P, 'UserId'>`) is kept, its marker being REQUIRED,
 *  and dropping it would stop a queried row going back into the model it came from. Tuples are left
 *  alone: pg's `point({mode: 'tuple'})` is `[number, number]`, mapping it would flatten it to `number[]`. */
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

/** What a dialect's toDrizzle module injects into materialization. Typed loosely on purpose: this
 *  package never sees drizzle's types. */
export interface DrizzleContext {
  /** The dialect namespace (`drizzle-orm/pg-core`, `drizzle-orm/mysql-core`, ...). */
  ns: Record<string, (...args: never[]) => unknown>;
  /** The root `sql` export of drizzle-orm. Only the tagged template and `raw` are typed here. */
  sqlNs: SqlNamespace;
}
export interface SqlNamespace {
  (strings: TemplateStringsArray, ...values: unknown[]): unknown;
  raw(query: string): unknown;
}

export interface RecordedCall {
  method: string;
  args: unknown[];
}

/** Opaque type of a recorded sql template, accepted wherever the authoring surface accepts SQL
 *  (defaults, checks, generated columns, index where-clauses). */
export interface RtSql {
  readonly [rtColumnKey]?: {rtSql: true};
}

/** A column reference decorated for an index position (`t.name.asc()` inside extraConfig), produced
 *  WITHOUT touching the column's own recorded calls. */
export interface RtIndexedColumn {
  readonly [rtColumnKey]?: {rtIndexedColumn: true};
  asc(): RtIndexedColumn;
  desc(): RtIndexedColumn;
  nullsFirst(): RtIndexedColumn;
  nullsLast(): RtIndexedColumn;
  op(op: string): RtIndexedColumn;
}

/** The extraConfig view of a column: only the index-position decorators. The runtime objects are the
 *  recorders themselves, which carry these methods. */
export type RtExtraColumn = RtIndexedColumn;

/** The extraConfig replay scope: WHICH table is materializing and the columns
 *  drizzle handed its extraConfig callback. */
export interface ExtraConfigScope {
  table: object;
  columns: Record<string, unknown>;
}

/** Internal view of RtIndexedColumnImpl for table.ts. */
export interface IndexedColumnInternal {
  column: RtColumnRecorder;
  calls: RecordedCall[];
}

// ── The type road ────────────────────────────────────────────────────────────

// An `any` config (AnyTable, a table not known statically) takes any value rather than ValueOf's `any[]` branch.
type DataOfCol<C> = ColSpecOf<C> extends {config: infer P; data: infer D} ? (0 extends 1 & P ? unknown : ValueOf<P, D>) : never;

/** Per-column runtime callbacks a type cannot carry, keyed like the column's $ markers. */
export type RuntimeCallbacks<T extends AnyTable> = {
  [K in keyof T['columns']]?: {
    $default?: () => DataOfCol<T['columns'][K]> | RtSql;
    $defaultFn?: () => DataOfCol<T['columns'][K]> | RtSql;
    $onUpdate?: () => DataOfCol<T['columns'][K]> | RtSql;
    $onUpdateFn?: () => DataOfCol<T['columns'][K]> | RtSql;
  };
};
export interface TableFromTypeOptions<T extends AnyTable = AnyTable> {
  tables?: Record<string, TableDep>;
  runtime?: RuntimeCallbacks<T>;
}

/** A referenced table, or a thunk returning it. The thunk is what makes a FORWARD reference
 *  spellable: drizzle's references are lazy, so schemas routinely point at a table declared further
 *  down the file, where a bare value in the options object would read it before its declaration. */
export type TableDep = object | (() => object);

/** Minimal structural view of a reflected RunType node, the walker's whole vocabulary. */
export interface ReflectedNode {
  id: string;
  kind?: unknown;
  name?: unknown;
  literal?: unknown;
  child?: ReflectedNode;
  children?: ReflectedNode[];
}
