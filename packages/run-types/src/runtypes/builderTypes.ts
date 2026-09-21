// The format-builder TYPE channel, shared by the value-first builders under `formats/` and the
// composers under `schema/`. It lives in the neutral `runtypes/` layer so neither authoring surface
// depends on the other. No `infer` anywhere (per CLAUDE.md): every helper is an `extends`-guard plus
// an indexed-access read. `TypeFormat` is imported as a VALUE, not `import type`, because that keeps
// the brand alias's reflection metadata reachable for tsgo.

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

/** The carrier is `{t: T}`, so `NonNullable` strips the optional WRAPPER, not `T`: an intentional null/undefined `T` survives. **/
export type InferType<RT> = RT extends RunType ? NonNullable<RT['__rtType']>['t'] : RT;

// ─────────────────────────────── Leaves ─────────────────────────────
//
// The single source of truth from a leaf's FORMAT identity to its branded TS type: adding a leaf format is ONE edit here.
// Keyed by the format brand name (`__rtFormatName`) because that name encodes both the reflection kind and the subKind.
// The lone bare leaf with no format (boolean) needs no row: `boolean()` returns `RunType<boolean>` directly.

/** `P` is bound only to `object` so one `P` fits every row; each builder validates its own params at the call site. **/
// The temporal rows' `P extends MinMax` guard NARROWS, never intersects, so no spurious `min?/max?` reaches the reflected params.
export interface LeafTypeByFormatName<P extends object, BrandName extends string = never> {
  stringFormat: TypeFormat<string, 'stringFormat', P, BrandName>;
  numberFormat: TypeFormat<number, 'numberFormat', P, BrandName>;
  bigintFormat: TypeFormat<bigint, 'bigintFormat', P, BrandName>;
  nativeDate: TypeFormat<Date, 'nativeDate', P, BrandName>;
  // Temporal leaves are unbranded: branding them needs a brand slot in the `FormatTemporal*` aliases and in `temporalBuilder`.
  temporalInstant: P extends MinMax ? Instant<P> : never;
  temporalZonedDateTime: P extends MinMax ? ZonedDateTime<P> : never;
  temporalPlainDate: P extends MinMax ? PlainDate<P> : never;
  temporalPlainTime: P extends MinMax ? PlainTime<P> : never;
  temporalPlainDateTime: P extends MinMax ? PlainDateTime<P> : never;
  temporalPlainYearMonth: P extends MinMax ? PlainYearMonth<P> : never;
}

export type LeafFormatName = keyof LeafTypeByFormatName<Record<string, never>>;

/** A bare `<const P extends Allowed>` accepts excess keys: a `max` typo would compile and silently drop the constraint. **/
// Wrap it INSIDE `CompTimeArgs<…>`, never intersected onto the annotation, or the Go scanner stops detecting the annotation syntactically.
// Transparent when `P` has no excess key, so `P` and the structural id read off it are unchanged.
export type ExactParams<P, Allowed> = P & Record<Exclude<keyof P, keyof Allowed>, never>;

/** The default `BrandName` of `never` keeps the leaf mutually assignable with its base; `brand(name)` opts INTO the nominal `Format*<P, B>`. **/
export type LeafType<Name extends LeafFormatName, P extends object, BrandName extends string = never> = LeafTypeByFormatName<
  P,
  BrandName
>[Name];

/** An OBJECT, not a bare string: a string is assignable to `InjectRunTypeId`, so the brand slot could not sit before the trailing id. **/
// `B` flows into `LeafType<…, B>`, so a branded value-first leaf converges on the same structural id as the type-first `Format*<P, B>`.
export interface BrandArg<B extends string> {
  readonly __rtBrandName: B;
}

// ─────────────────────────── Temporal lookups ───────────────────────
//
// Routed through the leaf map so the format→type mapping and the Temporal-lib coupling stay out of the builder file.

/** Authoring tag → branded temporal format type (params-present overload). **/
export interface TemporalFormatByTag<P extends MinMax> {
  'temporal.instant': LeafType<'temporalInstant', P>;
  'temporal.zonedDateTime': LeafType<'temporalZonedDateTime', P>;
  'temporal.plainDate': LeafType<'temporalPlainDate', P>;
  'temporal.plainTime': LeafType<'temporalPlainTime', P>;
  'temporal.plainDateTime': LeafType<'temporalPlainDateTime', P>;
  'temporal.plainYearMonth': LeafType<'temporalPlainYearMonth', P>;
}

/** The no-params overload's return, routed through `TemporalBaseByFormatName` so `Temporal.*` stays named only in temporalFormats.ts. **/
export interface TemporalBaseByTag {
  'temporal.instant': TemporalBaseByFormatName['temporalInstant'];
  'temporal.zonedDateTime': TemporalBaseByFormatName['temporalZonedDateTime'];
  'temporal.plainDate': TemporalBaseByFormatName['temporalPlainDate'];
  'temporal.plainTime': TemporalBaseByFormatName['temporalPlainTime'];
  'temporal.plainDateTime': TemporalBaseByFormatName['temporalPlainDateTime'];
  'temporal.plainYearMonth': TemporalBaseByFormatName['temporalPlainYearMonth'];
  // Absent from `TemporalFormatByTag`: these two have no ordering, so their builders are no-param-only.
  'temporal.plainMonthDay': TemporalBaseByFormatName['temporalPlainMonthDay'];
  'temporal.duration': TemporalBaseByFormatName['temporalDuration'];
}

/** The no-params/plain ↔ params/branded overload split the scalar leaves share. **/
export interface TemporalBuilderFn<Tag extends keyof TemporalFormatByTag<MinMax>> {
  (id?: InjectRunTypeId<TemporalBaseByTag[Tag]>): RunType<TemporalBaseByTag[Tag]>;
  <const P extends MinMax>(
    formatParams: CompTimeArgs<ExactParams<P, MinMax>>,
    id?: InjectRunTypeId<TemporalFormatByTag<P>[Tag]>
  ): RunType<TemporalFormatByTag<P>[Tag]>;
}

/** Named on purpose: the emitted `.d.ts` references it unresolved instead of resolving `TemporalBaseByTag[Tag]` to a bare `Temporal.*`. **/
// Inlining it would re-introduce the Temporal-lib requirement into the published surface.
export interface TemporalInstanceBuilderFn<Tag extends 'temporal.plainMonthDay' | 'temporal.duration'> {
  (id?: InjectRunTypeId<TemporalBaseByTag[Tag]>): RunType<TemporalBaseByTag[Tag]>;
}
