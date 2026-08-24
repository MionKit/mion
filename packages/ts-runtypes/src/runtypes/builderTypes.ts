// The format-builder TYPE channel — shared by BOTH the value-first format
// builders under `formats/` AND the schema composers under `schema/`. It lives in
// the neutral `runtypes/` layer (not `schema/` or `formats/`) so neither
// authoring surface has to depend on the other: `formats/` stays self-contained /
// opt-in, and `schema/` keeps its composer helpers. No `infer` anywhere (per
// CLAUDE.md): every helper is an `extends`-guard + indexed-access read.
//
// The headline export is `InferType<RT>` — the single "recover the source TS type
// a `RunType<T>` represents" extractor (the role TypeBox's `Static<T>` plays, by
// another lineage):
//
//   const Name = string({maxLength: 50});   // RunType<String<{maxLength: 50}>>
//   type Name = InferType<typeof Name>;      // String<{maxLength: 50}>
//
// `TypeFormat` is imported as a VALUE (not `import type`): the value-level import
// keeps the brand alias's reflection metadata reachable for tsgo, the same
// constraint the `formats/` modules document.

import {TypeFormat} from './typeFormat.ts';
import type {RunType} from './types.ts';
import type {InjectRunTypeId, CompTimeArgs} from '../markers.ts';
import type {MinMax} from '../formats/datetime/dateTimeParams.ts';
import type {
  Instant,
  ZonedDateTime,
  PlainDate,
  PlainTime,
  PlainDateTime,
  PlainYearMonth,
  TemporalBaseByFormatName,
} from '../formats/datetime/temporalFormats.ts';

// ────────────────────────────── InferType ───────────────────────────

/** The TS type a `RunType<T>` carries; identity for anything that isn't a
 *  `RunType`. The carrier is `{t: T}`, so `NonNullable` strips the `| undefined`
 *  the optional `?` adds to the WRAPPER and `['t']` reads `T` back — preserving an
 *  intentional `null`/`undefined` `T` (which a bare-`T` carrier + `NonNullable`
 *  would collapse to `never`). No `infer`. **/
export type InferType<RT> = RT extends RunType ? NonNullable<RT['__rtType']>['t'] : RT;

// ─────────────────────────────── Leaves ─────────────────────────────
//
// Leaf descriptor → TS type — the single source of truth mapping a leaf
// RunType's FORMAT identity back to the branded TS type it represents. The
// value-first leaf builders route their carried `RunType<T>` through this map, so
// adding a leaf format is ONE edit here. Keyed by the format brand NAME
// (`__rtFormatName`) because the name is the precise leaf discriminator — it
// encodes both the reflection kind and subKind:
//   stringFormat     → kind string (5)        nativeDate       → class (20) + date (2001)
//   numberFormat     → kind number (6)        temporalInstant… → class (20) + temporal* (2101–2106)
//   bigintFormat     → kind bigint (9)
// The lone bare leaf with no format (boolean, kind 7) needs no row — `boolean()`
// returns `RunType<boolean>` directly.

/** Format brand name → branded leaf type, parameterized by that leaf's params
 *  `P`. The non-temporal rows use `TypeFormat<Base, Name, P>` directly (only a
 *  `P extends object` bound) so a single `P` flows to every row without each
 *  family's own param constraint — each builder validates its own params at the
 *  call site. The temporal rows self-guard `P extends MinMax ? … : never`: the
 *  guard NARROWS, it does not intersect, so `P` flows through unchanged and no
 *  spurious `min?/max?: string | undefined` is injected into the reflected
 *  params. **/
export interface LeafTypeByFormatName<P extends object, BrandName extends string = never> {
  stringFormat: TypeFormat<string, 'stringFormat', P, BrandName>;
  numberFormat: TypeFormat<number, 'numberFormat', P, BrandName>;
  bigintFormat: TypeFormat<bigint, 'bigintFormat', P, BrandName>;
  nativeDate: TypeFormat<Date, 'nativeDate', P, BrandName>;
  // Temporal leaves don't thread `BrandName` yet — value-first temporal branding
  // is a follow-up (the hand-rolled `FormatTemporal*` aliases + the generic
  // `temporalBuilder` need the same brand slot). Unbranded today.
  temporalInstant: P extends MinMax ? Instant<P> : never;
  temporalZonedDateTime: P extends MinMax ? ZonedDateTime<P> : never;
  temporalPlainDate: P extends MinMax ? PlainDate<P> : never;
  temporalPlainTime: P extends MinMax ? PlainTime<P> : never;
  temporalPlainDateTime: P extends MinMax ? PlainDateTime<P> : never;
  temporalPlainYearMonth: P extends MinMax ? PlainYearMonth<P> : never;
}

/** Every leaf format brand name (the keys of `LeafTypeByFormatName`). **/
export type LeafFormatName = keyof LeafTypeByFormatName<Record<string, never>>;

/** Exact-params guard — keeps a format builder's `formatParams` STRONGLY typed by
 *  rejecting any key of `P` that isn't declared in the family's `Allowed` params
 *  interface. A generic `<const P extends Allowed>` alone does NOT reject excess
 *  keys once a valid key is also present (excess-property checking doesn't fire on
 *  constraint satisfaction), so `number({min: 0, mn: 100})` — a `max` typo — would
 *  otherwise compile and silently drop the constraint. Folding `Record<Exclude<…>,
 *  never>` in forces every excess key to `never`, so it errors instead. It is
 *  wrapped INSIDE the `CompTimeArgs<…>` type argument (never intersected onto the
 *  parameter annotation) so the annotation stays a single `CompTimeArgs<…>`
 *  reference the Go scanner detects syntactically. Transparent when `P` has no
 *  excess key (`Record<never, never>` is `{}`, so `P & {}` is `P`), so `P` — and
 *  the reflected type / structural id read off it — is unchanged. **/
export type ExactParams<P, Allowed> = P & Record<Exclude<keyof P, keyof Allowed>, never>;

/** The branded leaf type for a format `Name` with params `P` and optional nominal
 *  `BrandName` — the builders' carried `RunType<…>` type and the type the scanner
 *  reflects off the brand. `BrandName` defaults to `never` (no brand): an unbranded
 *  leaf is a transparent annotation (mutually assignable with its base), while
 *  passing a brand (via the value-first `brand(name)` tag) opts INTO the nominal
 *  `Format*<P, BrandName>`. **/
export type LeafType<Name extends LeafFormatName, P extends object, BrandName extends string = never> = LeafTypeByFormatName<
  P,
  BrandName
>[Name];

/** The tag `brand(name)` produces — a distinct carrier for a value-first format
 *  brand name. Its OBJECT shape (not a bare string) is what lets the builder's
 *  brand slot sit BEFORE the trailing injected id without the two colliding: a
 *  plain string is assignable to `InjectRunTypeId`, a `BrandArg` is not, so
 *  overload resolution can't confuse the user's brand with the plugin's id. The
 *  carried `B` flows into the leaf's `LeafType<…, B>` → `TypeFormat<…, B>`
 *  BrandName, so a branded value-first leaf reflects the SAME nominal
 *  `Format*<P, B>` the type-first surface does and converges on its structural
 *  id. **/
export interface BrandArg<B extends string> {
  readonly __rtBrandName: B;
}

// ─────────────────────────── Temporal lookups ───────────────────────
//
// Authoring tag (`temporal.instant`, …) → branded / base temporal type, via the
// leaf reverse map (so the format→type mapping + the Temporal-lib coupling stay
// out of the builder file). Each branded row is `LeafType<'temporal<Name>', P>` =
// `FormatTemporal*<P>` for `P extends MinMax`.

/** Authoring tag → branded temporal format type (params-present overload). **/
export interface TemporalFormatByTag<P extends MinMax> {
  'temporal.instant': LeafType<'temporalInstant', P>;
  'temporal.zonedDateTime': LeafType<'temporalZonedDateTime', P>;
  'temporal.plainDate': LeafType<'temporalPlainDate', P>;
  'temporal.plainTime': LeafType<'temporalPlainTime', P>;
  'temporal.plainDateTime': LeafType<'temporalPlainDateTime', P>;
  'temporal.plainYearMonth': LeafType<'temporalPlainYearMonth', P>;
}

/** Authoring tag → UNBRANDED base instance type — the no-params overload's return.
 *  Routed through `TemporalBaseByFormatName` so `Temporal.*` stays named only in
 *  temporalFormats.ts, mirroring the `TemporalFormatByTag` rows. **/
export interface TemporalBaseByTag {
  'temporal.instant': TemporalBaseByFormatName['temporalInstant'];
  'temporal.zonedDateTime': TemporalBaseByFormatName['temporalZonedDateTime'];
  'temporal.plainDate': TemporalBaseByFormatName['temporalPlainDate'];
  'temporal.plainTime': TemporalBaseByFormatName['temporalPlainTime'];
  'temporal.plainDateTime': TemporalBaseByFormatName['temporalPlainDateTime'];
  'temporal.plainYearMonth': TemporalBaseByFormatName['temporalPlainYearMonth'];
  // No-ordering tags — present here (base instance type only) but absent from
  // `TemporalFormatByTag`, so their builders are no-param-only (no min/max brand).
  'temporal.plainMonthDay': TemporalBaseByFormatName['temporalPlainMonthDay'];
  'temporal.duration': TemporalBaseByFormatName['temporalDuration'];
}

/** Overloaded shape of each `temporal.<name>` builder — the no-params/plain ↔
 *  params/branded split shared by the scalar leaves. **/
export interface TemporalBuilderFn<Tag extends keyof TemporalFormatByTag<MinMax>> {
  (id?: InjectRunTypeId<TemporalBaseByTag[Tag]>): RunType<TemporalBaseByTag[Tag]>;
  <const P extends MinMax>(
    formatParams: CompTimeArgs<ExactParams<P, MinMax>>,
    id?: InjectRunTypeId<TemporalFormatByTag<P>[Tag]>
  ): RunType<TemporalFormatByTag<P>[Tag]>;
}

/** Shape of the no-ordering temporal builders (`plainMonthDay` / `duration`):
 *  one no-params overload, no min/max form. A NAMED generic interface on
 *  purpose — the emitted `.d.ts` references it unresolved
 *  (`TemporalInstanceBuilderFn<"temporal.duration">`) instead of inlining and
 *  resolving `TemporalBaseByTag[Tag]` to a bare `Temporal.*`, which would
 *  re-introduce the Temporal-lib requirement into the published surface (the
 *  same reason the branded aliases route through the guarded base map). **/
export interface TemporalInstanceBuilderFn<Tag extends 'temporal.plainMonthDay' | 'temporal.duration'> {
  (id?: InjectRunTypeId<TemporalBaseByTag[Tag]>): RunType<TemporalBaseByTag[Tag]>;
}
