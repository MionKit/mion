/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The pure-types table vocabulary core: the sentinel-carrying column type the
// dialect packages alias per builder (Varchar<'bio', {length: 500}>), the
// modifier marker interfaces (NotNull, PrimaryKey, ...), and the normalization
// that turns an authored intersection into a column carrying the same
// RtColumnBrand the builders produce — which is what keeps Infer*Model,
// refineTableType and ToDrizzleTable working unchanged on both roads.
//
// Everything rides two OPTIONAL unique-symbol sentinels (the FormatBrand
// pattern from @ts-runtypes/core): optional, so a column type stays assignable
// wherever its data type is; symbol-keyed, so reflection carries the literals
// (builder fn, db column name, config, modifiers) and tableFromType / the Go
// convert program can rebuild the builder calls from the type alone.

import type {AnyRtColumn, RtColumnBrand} from './recorder.ts';
import {rtColumnKeyFlagsKey} from './recorder.ts';

/** Sentinel key of the column spec (builder fn, db name, config, data). */
export const rtColSpecKey: unique symbol = Symbol('rtColSpec');
/** Sentinel key every modifier marker stores its flag under. */
export const rtColModsKey: unique symbol = Symbol('rtColMods');
/** Sentinel key of the literal sql carrier (Sql<'now()'>). */
export const rtSqlTextKey: unique symbol = Symbol('rtSqlText');

/** Literal sql for type-road values (`Default<Sql<'now()'>>` mirrors
 *  `.default(sql\`now()\`)`). TEXT only: a template with interpolations has no
 *  type spelling and stays builders-only. */
export interface Sql<Text extends string> {
  readonly [rtSqlTextKey]?: {sql: Text};
}

/** What a dialect column type (Varchar, Uuid, ...) expands to. `Fn` is the
 *  builder function name; `Name` the db column name (undefined = the record
 *  key is the db name, mirroring nameless builders); `Config` the builder's
 *  own config object as a literal type; `Data` the runtype-format data type
 *  the builder of the same call would infer. `BaseNotNull` / `BaseHasDefault`
 *  are the builder's INTRINSIC flags (serial-likes start notNull+hasDefault);
 *  they fold into the normalized brand but are never replayed as modifiers. */
export interface RtColType<
  Fn extends string,
  Name extends string | undefined,
  Config,
  Data,
  // The builder's INTRINSIC flags, named rather than spelled as four booleans:
  // almost every builder has none, and `never` costs the checker nothing where
  // a four-member object of `false`s was instantiated on every declared column.
  //   notNull / hasDefault     the serial-likes start with both
  //   primaryKeyHasDefault     sqlite's `integer primary key` IS the rowid, so
  //                            a plain .primaryKey() gives it a db default
  //   autoincrement            mysql's serial is auto-incrementing before any
  //                            modifier runs, and $returningId() reads it
  Base extends ColBaseFlag = never,
> {
  readonly [rtColSpecKey]?: {fn: Fn; name: Name; config: Config; data: Data; base: Base};
}
/** The intrinsic flag names a column type may declare. */
export type ColBaseFlag = 'notNull' | 'hasDefault' | 'primaryKeyHasDefault' | 'autoincrement';
export type AnyRtColType = {
  readonly [rtColSpecKey]?: {fn: string; name: string | undefined; config: object; data: unknown; base: ColBaseFlag};
};

/** First type arg of a column type: a string is the db column name, an object
 *  is the config (the nameless form), undefined is the bare form. */
export type ColNameArg<A> = A extends string ? A : undefined;
export type ColConfigArg<A, Config> = A extends object ? A : Config;

// ── Modifier markers ─────────────────────────────────────────────────────────
// One interface per recorder modifier method, named upperFirst(method). Each
// stores exactly `{<method>: <args>}` under the mods sentinel, so intersecting
// markers merges them and both the runtime bridge and the convert program read
// the method name straight off the key.

// A no-arg modifier stores `true`; a modifier with arguments stores the args
// TUPLE (never the bare value: `default(true)` must stay distinguishable from
// a no-arg flag when the bridge replays the calls). Optional call args encode
// as a shorter tuple, so `unique()` and `unique('nm')` both spell exactly the
// call the bridge replays.
export interface NotNull {
  readonly [rtColModsKey]?: {notNull: true};
}
/** Bare `PrimaryKey` mirrors `.primaryKey()`; sqlite's config form
 *  (`PrimaryKey<{autoIncrement: true}>`) mirrors `.primaryKey(config)`. */
export interface PrimaryKey<Config = undefined> {
  readonly [rtColModsKey]?: {primaryKey: [Config] extends [undefined] ? true : [Config]};
}
export interface Default<V> {
  readonly [rtColModsKey]?: {default: [V]};
}
export interface DefaultRandom {
  readonly [rtColModsKey]?: {defaultRandom: true};
}
export interface DefaultNow {
  readonly [rtColModsKey]?: {defaultNow: true};
}
export interface Unique<Name extends string | undefined = undefined, Config = undefined> {
  readonly [rtColModsKey]?: {unique: [Config] extends [undefined] ? ([Name] extends [undefined] ? [] : [Name]) : [Name, Config]};
}
/** The VALUE form only; sql expressions and callbacks stay builders-only. */
export interface GeneratedAlwaysAs<V> {
  readonly [rtColModsKey]?: {generatedAlwaysAs: [V]};
}
export interface GeneratedAlwaysAsIdentity<Sequence = undefined> {
  readonly [rtColModsKey]?: {generatedAlwaysAsIdentity: [Sequence] extends [undefined] ? [] : [Sequence]};
}
export interface GeneratedByDefaultAsIdentity<Sequence = undefined> {
  readonly [rtColModsKey]?: {generatedByDefaultAsIdentity: [Sequence] extends [undefined] ? [] : [Sequence]};
}
/** mysql. */
export interface Autoincrement {
  readonly [rtColModsKey]?: {autoincrement: true};
}
/** mysql. */
export interface OnUpdateNow {
  readonly [rtColModsKey]?: {onUpdateNow: true};
}
/** `.array(size?)`; dialects re-export it as `Array` (the same global-name
 *  convention the runtype formats use for String/Number/Date). */
export interface ColArray<Size extends number | undefined = undefined> {
  readonly [rtColModsKey]?: {array: [Size] extends [undefined] ? [] : [Size]};
}
/** `.references(() => other.column, actions?)`: the referenced table by DB
 *  name and the column by record key. The runtime bridge resolves the pair
 *  through tableFromType's deps argument ({tables: {parents: parentsTable}}). */
export interface References<
  Table extends string,
  Column extends string,
  Actions extends {onDelete?: string; onUpdate?: string} | undefined = undefined,
> {
  readonly [rtColModsKey]?: {
    references: [Actions] extends [undefined] ? [{table: Table; column: Column}] : [{table: Table; column: Column}, Actions];
  };
}
/** `.$type<T>()` — drizzle's own type-only override; never replayed. */
export interface $Type<Override> {
  readonly [rtColModsKey]?: {$type: [Override]};
}
// The runtime-callback modifiers ($default/$defaultFn and $onUpdate/$onUpdateFn
// are drizzle aliases; the marker keeps the exact method so convert round-trips
// byte-identically). A callback has no type spelling, so the marker stores only
// the flag; the callback itself rides tableFromType's options
// (`{runtime: {colKey: {$defaultFn: () => ...}}}`) and the bridge validates
// marker and callback match both ways. All four set HasDefault, mirroring the
// builder recorders.
/** `.$default(cb)`. */
export interface $Default {
  readonly [rtColModsKey]?: {$default: true};
}
/** `.$defaultFn(cb)`. */
export interface $DefaultFn {
  readonly [rtColModsKey]?: {$defaultFn: true};
}
/** `.$onUpdate(cb)`. */
export interface $OnUpdate {
  readonly [rtColModsKey]?: {$onUpdate: true};
}
/** `.$onUpdateFn(cb)`. */
export interface $OnUpdateFn {
  readonly [rtColModsKey]?: {$onUpdateFn: true};
}

// ── Table-level entries (the extraConfig road) ───────────────────────────────

/** Sentinel key of a table entry spec (index/unique/check/foreignKey/...). */
export const rtEntrySpecKey: unique symbol = Symbol('rtEntrySpec');

/** One table-level entry: the helper fn, its literal args, and the chained
 *  calls — the exact replay the runtime bridge performs against the dialect
 *  namespace (`ns[fn](...args)` then each chain method). Inside args/chain:
 *  a column of THIS table spells `{col: key}`, a column of another table
 *  `{table: dbName, col: key}`, literal sql `Sql<'...'>`. Chain values encode
 *  like modifiers: an args tuple, or `true` for a no-arg call. The dialect
 *  packages export friendlier per-helper aliases (IndexEntry, ...) expanding
 *  to this carrier; the convert program's canonical type form spells it
 *  directly. */
export interface TableEntry<
  Fn extends string,
  Args extends readonly unknown[] = [],
  Chain extends object = Record<never, never>,
> {
  readonly [rtEntrySpecKey]?: {fn: Fn; args: Args; chain: Chain};
}

/** Map record keys onto self-column refs (the per-helper aliases' plumbing). */
export type EntryColRefs<Keys extends readonly string[]> = {[I in keyof Keys]: {col: Keys[I]}};

// ── Normalization ────────────────────────────────────────────────────────────

/** The merged mods object of an authored column intersection ({} when none). */
export type ColModsOf<C> = typeof rtColModsKey extends keyof C
  ? {[K in keyof NonNullable<C[typeof rtColModsKey]>]: NonNullable<C[typeof rtColModsKey]>[K]}
  : Record<never, never>;
/** The spec of an authored column (never for a non-column member, which makes
 *  the misuse surface as an error in the model types instead of vanishing). */
export type ColSpecOf<C> = typeof rtColSpecKey extends keyof C ? NonNullable<C[typeof rtColSpecKey]> : never;

type HasAnyKey<Mods, Keys extends string> = Extract<keyof Mods, Keys> extends never ? false : true;
type ModNotNull<Base extends string, Mods> = 'notNull' extends Base
  ? true
  : HasAnyKey<Mods, 'notNull' | 'primaryKey' | 'generatedAlwaysAsIdentity' | 'generatedByDefaultAsIdentity'>;
// onUpdateNow mirrors the mysql builder (`.onUpdateNow()` sets HasDefault);
// sqlite's `.primaryKey({autoIncrement: true})` gains a database default too.
// The four $-runtime markers mirror the recorder kinds: all set HasDefault.
// So do the GENERATED ones: drizzle's HasGenerated and IsIdentity both set
// hasDefault, and without it a generated column is notNull-and-defaultless,
// which is drizzle's definition of REQUIRED on insert — the opposite of what a
// generated column is.
type ModHasDefault<Base extends string, Mods> = 'hasDefault' extends Base
  ? true
  : HasAnyKey<
        Mods,
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
        | '$onUpdateFn'
      > extends true
    ? true
    : Mods extends {primaryKey: [{autoIncrement: true}]}
      ? true
      : // sqlite's integer: ANY primaryKey() carries a default, since the
        // column is the rowid. Its col type opts in via the base flag.
        'primaryKeyHasDefault' extends Base
        ? HasAnyKey<Mods, 'primaryKey'>
        : false;
type ModInsertExcluded<Mods> = HasAnyKey<Mods, 'generatedAlwaysAs' | 'generatedAlwaysAsIdentity'>;

/** The key flags drizzle's mysql `$returningId()` reads, recovered from the
 *  modifier calls the type road records PLUS the builder's intrinsic ones (a
 *  serial column auto-increments without anyone calling .autoincrement()). */
type ModKeyFlags<Base extends string, Mods> = {
  primaryKey: HasAnyKey<Mods, 'primaryKey'>;
  autoincrement: 'autoincrement' extends Base ? true : HasAnyKey<Mods, 'autoincrement'>;
  runtimeDefault: HasAnyKey<Mods, '$default' | '$defaultFn'>;
  identity: HasAnyKey<Mods, 'generatedAlwaysAsIdentity'> extends true
    ? 'always'
    : HasAnyKey<Mods, 'generatedByDefaultAsIdentity'> extends true
      ? 'byDefault'
      : undefined;
};

type WithTypeOverride<Data, Mods> = Mods extends {$type: [infer Override]} ? Override : Data;
type WithArray<Data, Mods> = 'array' extends keyof Mods ? Data[] : Data;
type SpecData<Spec> = Spec extends {data: infer Data} ? Data : never;

/** A normalized type-road column: the SAME brand the builders return, plus the
 *  spec and mods sentinels reflection recovers the builder calls from. */
export interface RtTypedColumn<
  Data,
  NotNullFlag extends boolean,
  HasDefaultFlag extends boolean,
  InsertExcludedFlag extends boolean,
  Spec,
  Mods,
  Base extends string = never,
> extends RtColumnBrand<Data, NotNullFlag, HasDefaultFlag, InsertExcludedFlag> {
  // The key flags are a MEMBER, not a type argument to RtColumnKeyBrand: a
  // property type inside a generic interface is instantiated only when it is
  // read, and only mysql's $returningId() ever reads them. As a type argument
  // every declared column paid ModKeyFlags eagerly.
  readonly [rtColumnKeyFlagsKey]?: ModKeyFlags<Base, Mods>;
  readonly [rtColSpecKey]?: Spec;
  readonly [rtColModsKey]?: Mods;
}

// The spec and the mods are read ONCE and threaded down, so every derivation
// below works on the extracted pair instead of re-extracting it from the
// column type on each of the five uses.
export type NormalizeCol<C> = C extends {readonly [rtColSpecKey]?: infer Spec; readonly [rtColModsKey]?: infer Mods}
  ? NormalizedCol<NonNullable<Spec>, NonNullable<Mods>>
  : NormalizedCol<ColSpecOf<C>, ColModsOf<C>>;
type SpecBase<Spec> = Spec extends {base: infer Base extends string} ? Base : never;
type NormalizedCol<Spec, Mods> = RtTypedColumn<
  WithArray<WithTypeOverride<SpecData<Spec>, Mods>, Mods>,
  ModNotNull<SpecBase<Spec>, Mods>,
  ModHasDefault<SpecBase<Spec>, Mods>,
  ModInsertExcluded<Mods>,
  Spec,
  Mods,
  SpecBase<Spec>
>;

/** Normalize a whole authored columns record; what the dialect table wrappers
 *  (PgTable, MysqlTable, SqliteTable) feed into RtTable. A record of
 *  already-branded builder columns passes through WHOLESALE (one record-level
 *  check, no per-column mapping) — that is what lets the builder factories
 *  declare the dialect table types as their returns without paying the
 *  normalization on every declared table. The probe works because only
 *  builder columns carry the rtColumnKey brand as a common property; a
 *  type-road record fails the weak-type check and takes the mapped branch. */
export type TypedCols<Cols> = Cols extends Record<string, AnyRtColumn> ? Cols : {[K in keyof Cols]: NormalizeCol<Cols[K]>};
