/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The pure-types table vocabulary core: the column type the dialect packages
// alias per builder (Varchar<'bio', {length: 500; notNull: true}>), the
// modifier vocabulary those aliases take, and the table-entry carrier.
//
// A column type expands STRAIGHT to the same RtColumnBrand the builders return,
// which is what keeps Infer*Model, refineTableType and ToDrizzleTable working
// unchanged on both roads — and what lets TypedCols hand a whole authored
// record through wholesale instead of normalizing it column by column. See
// ../TYPE-COST.md for what the carrier-plus-normalization shape used to cost.
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

/** What a dialect column type (Varchar, Uuid, ...) expands to: the SAME branded
 *  column the builder of the same call returns, plus the reflection sentinels.
 *
 *  `Fn` is the builder function name; `Name` the db column name (undefined = the
 *  record key is the db name, mirroring nameless builders); `Props` the ONE
 *  authored object carrying both the builder's own config and the modifier calls
 *  (see ColMods below); `Data` the runtype-format data type the builder of the
 *  same call would infer. */
export type RtColType<
  Fn extends string,
  Name extends string | undefined,
  Props,
  Data,
  // The builder's INTRINSIC flags, named rather than spelled as four booleans:
  // almost every builder has none, and `never` costs the checker nothing where
  // a four-member object of `false`s was instantiated on every declared column.
  //   notNull / hasDefault     the serial-likes start with both
  //   primaryKeyHasDefault     sqlite's `integer primary key` IS the rowid, so
  //                            a plain .primaryKey() gives it a db default
  //   autoincrement            mysql's serial is auto-incrementing before any
  //                            modifier runs, and $returningId() reads it
  // They fold into the brand but are never replayed as modifier calls.
  Base extends ColBaseFlag = never,
> = RtTypedColumn<
  WithArray<WithTypeOverride<Data, Props>, Props>,
  ModNotNull<Base, Props>,
  ModHasDefault<Base, Props>,
  ModInsertExcluded<Props>,
  {fn: Fn; name: Name; config: Props; data: Data; base: Base},
  Props,
  Base
>;
/** The intrinsic flag names a column type may declare. */
export type ColBaseFlag = 'notNull' | 'hasDefault' | 'primaryKeyHasDefault' | 'autoincrement';
// `config` here is the WHOLE authored props object, modifier keys included: the
// readers split it, the type does not. Renaming the field would move the
// reflected shape all three readers agree on, so it keeps drizzle's own word for
// the builder's second argument.
export type AnyRtColType = {
  readonly [rtColSpecKey]?: {fn: string; name: string | undefined; config: object; data: unknown; base: ColBaseFlag};
};

/** First type arg of a column type: a string is the db column name, an object
 *  is the props (the nameless form, mirroring a builder called without a name),
 *  undefined is the bare form. */
export type ColNameArg<A> = A extends string ? A : undefined;
export type ColConfigArg<A, Props> = A extends object ? A : Props;

// ── Modifiers ────────────────────────────────────────────────────────────────
// A column type takes ONE object holding the builder's own config keys and the
// modifier calls together, mirroring the builder call it replays:
//
//   varchar('name', {length: 100}).notNull().unique('uq')
//   Varchar<'name', {length: 100; notNull: true; unique: ['uq']}>
//
// ONE rule for the value: a call with no arguments stores `true`, a call with
// arguments stores the args TUPLE. Never the bare value, so `default(true)`
// stays distinguishable from a flag when the bridge replays the calls. So
// `unique()` is `{unique: true}` and `unique('nm')` is `{unique: ['nm']}`, each
// spelling exactly the call to replay.
//
// Nothing in the object says which half a key belongs to, so BOTH readers split
// it by colModNames: the runtime bridge in ./fromType.ts and the Go convert
// program (ts-go-runtypes/internal/convert/drizzle.go). colMods.spec.ts gates
// that list against the dialect manifests and against every config interface
// key, so a drizzle upgrade cannot add either half of a collision unnoticed.

/** Every modifier method name a column type can carry, across all dialects. */
export const colModNames = [
  '$default',
  '$defaultFn',
  '$onUpdate',
  '$onUpdateFn',
  '$type',
  'array',
  'autoincrement',
  'default',
  'defaultNow',
  'defaultRandom',
  'generatedAlwaysAs',
  'generatedAlwaysAsIdentity',
  'generatedByDefaultAsIdentity',
  'notNull',
  'onUpdateNow',
  'primaryKey',
  'references',
  'unique',
] as const;
export type ColModName = (typeof colModNames)[number];
const colModNameSet: ReadonlySet<string> = new Set(colModNames);
/** Is this key a modifier call, or one of the builder's own config keys? */
export function isColModName(name: string): name is ColModName {
  return colModNameSet.has(name);
}

/** A `.references(() => other.column)` target: the table by DB name, the column
 *  by record key. The runtime bridge resolves the pair through tableFromType's
 *  deps argument ({tables: {orgs: orgsTable}}). */
export interface ColRef {
  table: string;
  column: string;
}

/** Every modifier a column type can spell, with the value each one records. The
 *  dialect packages Pick their own subset per builder kind, which is what makes
 *  `Varchar<'v', {autoincrement: true}>` an error rather than a silent no-op. */
export interface ColMods {
  notNull?: true;
  /** Bare `{primaryKey: true}` mirrors `.primaryKey()`; sqlite's config form
   *  (`{primaryKey: [{autoIncrement: true}]}`) mirrors `.primaryKey(config)`. */
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
  /** `.$type<T>()` — drizzle's own type-only override; never replayed. */
  $type?: readonly [unknown];
  // The runtime-callback modifiers ($default/$defaultFn and $onUpdate/$onUpdateFn
  // are drizzle aliases; the exact method is kept so convert round-trips
  // byte-identically). A callback has no type spelling, so the type stores only
  // the flag; the callback itself rides tableFromType's options
  // (`{runtime: {colKey: {$defaultFn: () => ...}}}`) and the bridge validates
  // that flag and callback match both ways. All four set HasDefault, mirroring
  // the builder recorders.
  $default?: true;
  $defaultFn?: true;
  $onUpdate?: true;
  $onUpdateFn?: true;
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

// ── Flag derivation ──────────────────────────────────────────────────────────
// What RtColType reads off the authored props to fill the four brand flags.

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

/** A type-road column: the SAME brand the builders return, plus the spec and
 *  mods sentinels reflection recovers the builder calls from. */
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

/** The authored columns record of a dialect table wrapper (PgTable, MysqlTable,
 *  SqliteTable), handed through WHOLESALE: a column type already IS the branded
 *  column the builders return, so there is nothing left to normalize and the
 *  record only needs one check instead of a per-column mapping.
 *
 *  The mapped branch is the misuse guard. A member that is not a column at all
 *  (a plain data type, say) fails the record check and maps to a column whose
 *  data is `never`, which surfaces the mistake in the model types instead of
 *  letting the member vanish. */
export type TypedCols<Cols> = Cols extends Record<string, AnyRtColumn> ? Cols : {[K in keyof Cols]: NotAColumn<Cols[K]>};
type NotAColumn<C> = C extends AnyRtColumn ? C : RtTypedColumn<never, false, false, false, never, Record<never, never>>;
