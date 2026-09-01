// Temporal format TYPE aliases — min/max bound constraints over the
// orderable builtin Temporal types. Opt-in via the dedicated
// `@mionjs/run-types/formats/temporal` subpath (NOT re-exported from the
// root `formats` surface) so consumers who don't use Temporal never need the
// Temporal lib.
//
// IMPORTANT: this file deliberately has NO `/// <reference lib="esnext.temporal" />`.
// The Go scanner's inferred-program path cannot load that lib (it breaks lib
// resolution — see temporal-support.md §0); a reference here would make
// `Temporal.*` resolve to `any` DURING THE SCAN, collapse the `& {brand}`
// intersection, and silently drop the bounds. Temporal must instead be
// globally available to the program being scanned: the consumer's own
// tsconfig `lib` (which already includes it if they use Temporal), or the
// test harness's ambient (test/support/temporal-ambient.d.ts). If it isn't, the
// scanner raises TMP001 rather than emit a no-op validator.
//
// The brand intersection is written INLINE rather than via the shared
// `TypeFormat<Base,…>` helper on purpose: `TypeFormat`'s `Base extends
// TypeFormatBase` constraint lives in the root `runtypes/typeFormat.ts`, and
// naming `Temporal.*` there would force the Temporal lib on every marker
// consumer. The Go scanner detects a format brand structurally (the two
// `__rtFormat*` sentinel properties) regardless of how it's written, so the
// inline form is equivalent.
//
// Each bound (min/max) is an absolute Temporal string literal in the type's
// own ISO form (e.g. PlainDate `'2020-01-01'`, Instant `'2020-01-01T00:00:00Z'`)
// OR a relative `now±P…` ISO-8601 duration. The Go side validates the relative
// grammar + per-type duration-component restriction (Instant/PlainTime → time
// units only; PlainDate/PlainYearMonth → date units; PlainDateTime/
// ZonedDateTime → both) and emits `Temporal.X.compare(value, bound) >= 0/<= 0`.

import type {__rtFormatName, __rtFormatParams} from '../../runtypes/sentinelKeys.ts';

import {builderResult} from '../../runtypes/builderCore.ts';
import type {MinMax} from './dateTimeParams.ts';
import type {RunType} from '../../runtypes/types.ts';
import type {InjectRunTypeId} from '../../markers.ts';
import type {
  TemporalFormatByTag,
  TemporalBaseByTag,
  TemporalBuilderFn,
  TemporalInstanceBuilderFn,
} from '../../runtypes/builderTypes.ts';

// PlainMonthDay (no static compare) and Duration (a length, not an instant)
// are intentionally absent — they have no min/max ordering semantics.

// Guarded references to the global `Temporal.*` instance types. Each resolves
// to the REAL type when the consumer's `lib` provides the Temporal namespace,
// and degrades gracefully when it does NOT — so the published `.d.ts` never
// forces the Temporal lib on a consumer who doesn't use these formats, even
// though the root marker surface (`builderTypes` imports the branded aliases
// below) transitively loads this file. Reading `{prototype: infer I}` off the
// constructor value works whether `Temporal.X` is declared as a class or an
// interface + constructor const (the value always carries a `prototype` typed
// as the instance).
//
// TWO fallbacks, chosen by the POSITION the reference sits in:
//   • `unknown` (TemporalInstanceOf) for the brand aliases and the base map
//     below — INTERSECTION positions, where `unknown & {brand}` keeps the
//     intersection intact so the Go scanner still detects the format brand
//     structurally. Deliberately not `any` (any & X collapses to any).
//   • `never` (TemporalInstanceOrNever) for the DataOnlyNativeExtra
//     augmentation — a UNION-KEEP position. `unknown` there is poison: it
//     absorbs `DataOnlyNative = Date | RegExp | Extra[keyof Extra]` to
//     `unknown`, which turns DataOnly's keep arm into `T extends unknown`
//     (always true) and silently collapses `DataOnly<T>` to the IDENTITY for
//     every consumer without the Temporal lib. `never` vanishes from the
//     union instead, restoring the documented no-augmentation tail
//     (`Date | RegExp`).
type TemporalInstanceOf<K extends string> = typeof globalThis extends {Temporal: Record<K, {prototype: infer I}>} ? I : unknown;
type TemporalInstanceOrNever<K extends string> = typeof globalThis extends {Temporal: Record<K, {prototype: infer I}>}
  ? I
  : never;

type TInstant = TemporalInstanceOf<'Instant'>;
type TZonedDateTime = TemporalInstanceOf<'ZonedDateTime'>;
type TPlainDate = TemporalInstanceOf<'PlainDate'>;
type TPlainTime = TemporalInstanceOf<'PlainTime'>;
type TPlainDateTime = TemporalInstanceOf<'PlainDateTime'>;
type TPlainYearMonth = TemporalInstanceOf<'PlainYearMonth'>;
type TPlainMonthDay = TemporalInstanceOf<'PlainMonthDay'>;
type TDuration = TemporalInstanceOf<'Duration'>;

export type Instant<P extends MinMax = MinMax> = TInstant & {
  readonly [__rtFormatName]?: 'temporalInstant';
  readonly [__rtFormatParams]?: P;
};

export type ZonedDateTime<P extends MinMax = MinMax> = TZonedDateTime & {
  readonly [__rtFormatName]?: 'temporalZonedDateTime';
  readonly [__rtFormatParams]?: P;
};

export type PlainDate<P extends MinMax = MinMax> = TPlainDate & {
  readonly [__rtFormatName]?: 'temporalPlainDate';
  readonly [__rtFormatParams]?: P;
};

export type PlainTime<P extends MinMax = MinMax> = TPlainTime & {
  readonly [__rtFormatName]?: 'temporalPlainTime';
  readonly [__rtFormatParams]?: P;
};

export type PlainDateTime<P extends MinMax = MinMax> = TPlainDateTime & {
  readonly [__rtFormatName]?: 'temporalPlainDateTime';
  readonly [__rtFormatParams]?: P;
};

export type PlainYearMonth<P extends MinMax = MinMax> = TPlainYearMonth & {
  readonly [__rtFormatName]?: 'temporalPlainYearMonth';
  readonly [__rtFormatParams]?: P;
};

// Unbranded base instance type per temporal format — the type a no-params
// builder call (`temporal.instant()`) returns, so it converges with the
// type-first `Temporal.Instant` id instead of carrying a `FormatTemporal*`
// brand for empty params. Kept here beside the branded aliases so the
// Temporal-lib coupling stays in this module (define.ts indexes this map by
// authoring tag and never names `Temporal.*` directly).
export interface TemporalBaseByFormatName {
  temporalInstant: TInstant;
  temporalZonedDateTime: TZonedDateTime;
  temporalPlainDate: TPlainDate;
  temporalPlainTime: TPlainTime;
  temporalPlainDateTime: TPlainDateTime;
  temporalPlainYearMonth: TPlainYearMonth;
  // PlainMonthDay / Duration have no min/max ordering (see note above), so they
  // appear ONLY here as base instance types — there is no `FormatTemporal*` brand
  // and no `LeafType`/`TemporalFormatByTag` row for them. Their value-first
  // builders are no-param-only and converge with the type-first raw-instance form.
  temporalPlainMonthDay: TPlainMonthDay;
  temporalDuration: TDuration;
}

// The orderable subset, as a map so `keyof` drives the door's accepted
// `rtFormat` names rather than a restated union.
export interface TemporalFormatParamsByName {
  temporalInstant: MinMax;
  temporalZonedDateTime: MinMax;
  temporalPlainDate: MinMax;
  temporalPlainTime: MinMax;
  temporalPlainDateTime: MinMax;
  temporalPlainYearMonth: MinMax;
}

// ─────────────────────── DataOnly augmentation ──────────────────────
// Opt the 8 TC39 Temporal types into `DataOnly`'s KEEP set so
// `DataOnly<Temporal.Instant>` stays `Temporal.Instant` — the RT validates
// Temporal by `instanceof` / native identity, NOT by structural projection
// (see `DataOnly` in runtypes/dataOnly.ts). This augmentation lives HERE, in the
// lib-coupled `formats/temporal` subpath that already names `Temporal.*`, so
// core `runtypes/dataOnly.ts` never forces the Temporal lib on non-Temporal
// consumers. Only the VALUE union `DataOnlyNativeExtra[keyof …]` is read by
// `DataOnly`; the keys are arbitrary labels.
//
// ⚠️ These members MUST use the `never`-falling guard, not the `unknown` one:
// they land in DataOnly's union keep-list, where an `unknown` member absorbs
// the whole union and collapses `DataOnly<T>` to the identity for every
// consumer without the Temporal lib (see the guard comment above). Pinned by
// test/types/dataonlyTemporalPosture.test.ts in both postures.
declare module '../../runtypes/dataOnly.ts' {
  interface DataOnlyNativeExtra {
    temporalInstant: TemporalInstanceOrNever<'Instant'>;
    temporalZonedDateTime: TemporalInstanceOrNever<'ZonedDateTime'>;
    temporalPlainDate: TemporalInstanceOrNever<'PlainDate'>;
    temporalPlainTime: TemporalInstanceOrNever<'PlainTime'>;
    temporalPlainDateTime: TemporalInstanceOrNever<'PlainDateTime'>;
    temporalPlainYearMonth: TemporalInstanceOrNever<'PlainYearMonth'>;
    temporalPlainMonthDay: TemporalInstanceOrNever<'PlainMonthDay'>;
    temporalDuration: TemporalInstanceOrNever<'Duration'>;
  }
}

// ─────────────────────────── Temporal builders ──────────────────────
//
// Value-first builders for the `@mionjs/run-types/formats/temporal` subpath — flat
// (`import * as TFT from '@mionjs/run-types/formats/temporal'` → `TFT.instant()`), so a
// format's TYPE (`TFT.Instant`) and its BUILDER (`TFT.instant()`) live together.
// Co-located here (not under the root `formats` surface) so the Temporal-lib
// coupling stays in this one module. Each builder still returns the generic
// `RunType<…>` node and converges on the same structural id as the type-first
// `createValidateFn<Temporal.X>()` surface.

// `temporalBuilder` — shared factory for the 6 orderable temporal builders. Each
// fixes its tag and returns the matching branded `Instant`/`PlainDate`/… via the
// builderTypes tag→format lookup. Same no-params/plain ↔ params/branded overload
// split as the scalar leaves.
function temporalBuilder<Tag extends keyof TemporalFormatByTag<MinMax>>(tag: Tag): TemporalBuilderFn<Tag> {
  const build = (
    formatParamsOrId?: MinMax | InjectRunTypeId<TemporalBaseByTag[Tag]>,
    id?: InjectRunTypeId<TemporalBaseByTag[Tag]>
  ): RunType<TemporalBaseByTag[Tag]> => {
    const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
    const injectedId = typeof formatParamsOrId === 'string' ? formatParamsOrId : id;
    return builderResult(injectedId, {type: tag, formatParams});
  };
  return build as TemporalBuilderFn<Tag>;
}

/** A no-ordering temporal builder (`plainMonthDay` / `duration`). These have no
 *  min/max semantics, so — unlike `temporalBuilder` — there is only the no-params
 *  overload: it returns the raw instance type and converges with the type-first
 *  `createValidateFn<Temporal.PlainMonthDay>()` / `<Temporal.Duration>()` form. **/
function temporalInstanceBuilder<Tag extends 'temporal.plainMonthDay' | 'temporal.duration'>(
  tag: Tag
): TemporalInstanceBuilderFn<Tag> {
  return ((id?: InjectRunTypeId<TemporalBaseByTag[Tag]>) =>
    builderResult(id, {type: tag, formatParams: {}})) as TemporalInstanceBuilderFn<Tag>;
}

/** Temporal field builder — `TFT.instant()` / `TFT.instant({min: '…'})`. **/
export const instant = temporalBuilder('temporal.instant');
/** Temporal field builder — `TFT.zonedDateTime()`. **/
export const zonedDateTime = temporalBuilder('temporal.zonedDateTime');
/** Temporal field builder — `TFT.plainDate()`. **/
export const plainDate = temporalBuilder('temporal.plainDate');
/** Temporal field builder — `TFT.plainTime()`. **/
export const plainTime = temporalBuilder('temporal.plainTime');
/** Temporal field builder — `TFT.plainDateTime()`. **/
export const plainDateTime = temporalBuilder('temporal.plainDateTime');
/** Temporal field builder — `TFT.plainYearMonth()`. **/
export const plainYearMonth = temporalBuilder('temporal.plainYearMonth');
/** Temporal field builder — `TFT.plainMonthDay()` (no ordering). **/
export const plainMonthDay = temporalInstanceBuilder('temporal.plainMonthDay');
/** Temporal field builder — `TFT.duration()` (no ordering). **/
export const duration = temporalInstanceBuilder('temporal.duration');
