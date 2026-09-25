/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A column type is ONE optional sentinel {fn, raw props, data} with no db name and no owner, so one column
// shape is one shared type in every table. Flags are derived lazily from the raw props, never at declaration.

/** Sentinel key of the column spec: {fn, config, data, base}. */
export const rtColSpecKey: unique symbol = Symbol('rtColSpec');
/** Type-only key of a named builder result's db name, lifted by the table into its names map. */
export declare const rtColNameKey: unique symbol;
/** Type-only key of a named builder result's column. */
export declare const rtNamedColumnKey: unique symbol;
/** Sentinel key of the owner metadata the cols() view adds, read only by references(). */
export const rtColOwnerKey: unique symbol = Symbol('rtColOwner');

/** The intrinsic flag names a builder may declare (serial-likes, sqlite rowid, mysql serial). */
export type ColBaseFlag = 'notNull' | 'hasDefault' | 'primaryKeyHasDefault' | 'autoincrement';

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
export type AnyNamedColumn = NamedColumn<string, AnyColumn>;
export type AnyColumn = {readonly [rtColSpecKey]?: {fn: string; config: any; data: any; base: any}};

/** The spec payload of a column, `never` for a non-column. */
export type ColSpecOf<C> = C extends {readonly [rtColSpecKey]?: infer Spec} ? NonNullable<Spec> : never;

/** Props merged, flat so the result equals a hand-written object. */
export type Merge<Props, Mod> = {[K in keyof (Props & Mod)]: (Props & Mod)[K]};

/** Strip `readonly` from a const-inferred config so it equals the hand-written object. */
export type Writable<T> = {-readonly [K in keyof T]: T[K] extends readonly unknown[] ? MutableTuple<T[K]> : T[K]};
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
// Only function keys change, since no type spells a function: references() records {table, column}, a callback `true`.

/** The props keys that carry functions at run time. */
export type RuntimeModKeys = 'references' | '$default' | '$defaultFn' | '$onUpdate' | '$onUpdateFn';
type RefArgs<Args> = Args extends readonly [() => infer Target, infer Actions]
  ? [RefOf<Target>, {-readonly [K in keyof Actions]: Actions[K]}]
  : Args extends readonly [() => infer Target]
    ? [RefOf<Target>]
    : never;
/** The props a column type records for the props a builder was called with. */
export type PropsOf<C> = [keyof C & RuntimeModKeys] extends [never]
  ? Writable<C>
  : {
      -readonly [K in keyof C]: K extends 'references'
        ? RefArgs<C[K]>
        : K extends RuntimeModKeys
          ? true
          : C[K] extends readonly unknown[]
            ? MutableTuple<C[K]>
            : C[K];
    };

/** `$type<T>()` in a builder's props: drizzle's `.$type<T>()`, recorded as `{$type: [T]}`. Type-only. */
export function $type<T>(): [T] {
  return [] as unknown as [T];
}

// ── Owner metadata, only on the cols() view ──────────────────────────────────

/** What cols(table) adds to each column, so `references(() => cols(teams).id)` records {table, column}. */
export interface ColumnOwner<Table extends string, Key extends string> {
  readonly [rtColOwnerKey]?: {table: Table; column: Key};
}
/** Return annotation for a self-reference, which TypeScript cannot infer inside its own initializer (TS7022). */
export type SelfRef<Table extends string, Key extends string> = ColumnOwner<Table, Key>;
/** The ColRef a references() target records. */
export type RefOf<Target> = Target extends {readonly [rtColOwnerKey]?: infer Owner} ? NonNullable<Owner> : never;

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
  ? Props extends {primaryKey: [{autoIncrement: true}]}
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
export type SelectValueOf<Spec> = Spec extends {config: infer Props; data: infer Data; base: infer Base}
  ? SelectValue<Props, Data, Base>
  : never;

/** The primary-key default (sqlite's rowid, autoIncrement) only counts on a primary-key column. */
export type InsertKind<Props, Base> = [keyof Props & ExcludedKeys] extends [never]
  ? [(keyof Props & NotNullKeys) | (Base & 'notNull')] extends [never]
    ? 'optional'
    : [(keyof Props & DefaultKeys) | (Base & 'hasDefault')] extends [never]
      ? [keyof Props & 'primaryKey'] extends [never]
        ? 'required'
        : [Base & 'primaryKeyHasDefault'] extends [never]
          ? Props extends {primaryKey: [{autoIncrement: true}]}
            ? 'optional'
            : 'required'
          : 'optional'
      : 'optional'
  : 'excluded';
export type InsertKindOf<Spec> = Spec extends {config: infer Props; base: infer Base} ? InsertKind<Props, Base> : never;

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
