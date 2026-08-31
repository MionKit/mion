// Type-level format refinement: tighten a format-carrying type by merging
// extra params into the ones it already carries. Pure type utilities beside
// the FormatNameOf / FormatParamsOf introspection helpers; the
// @mionjs/drizzle-orm-*-core packages build refineTableType on top of these,
// and any other consumer deriving a stricter view of a formatted type can use
// them the same way.

import type {FormatNameOf, FormatParamsOf, TypeFormat, TypeFormatBase} from '../runtypes/typeFormat.ts';
import type {Mutable} from '../runtypes/types.ts';
import type {IPParams, StringParams} from './string/stringFormats.ts';
import type {NumberParams} from '../formats/numberFormats.ts';
import type {BigIntParams} from '../formats/bigintFormats.ts';
import type {NativeDateParams} from './datetime/dateFormats.ts';
import type {DateParams, DateTimeParams, TimeParams} from './datetime/stringDateTimeFormats.ts';

type Prettify<T> = {[K in keyof T]: T[K]} & {};

/** Format family -> the params a refinement may add for that family. A type
 *  whose data carries no family (or one missing here) refines to `never`, so
 *  ANY refinement on it is a compile error - never a silent bypass. */
export interface RefinableParamsByFamily {
  stringFormat: Partial<StringParams>;
  numberFormat: Partial<NumberParams>;
  bigintFormat: Partial<BigIntParams>;
  nativeDate: Partial<NativeDateParams>;
  date: Partial<DateParams>;
  time: Partial<TimeParams>;
  dateTime: Partial<DateTimeParams>;
  ip: Partial<IPParams>;
}

/** The params a refinement may add to `T` (`RefinableParamsOf<Str>` is
 *  `Partial<StringParams>`), or `never` when `T` carries no refinable format. */
export type RefinableParamsOf<T> =
  FormatNameOf<T> extends keyof RefinableParamsByFamily ? RefinableParamsByFamily[FormatNameOf<T>] : never;

/** The primitive base `T`'s format rides on (`FormatBaseOf<Email>` is `string`),
 *  completing the FormatNameOf / FormatParamsOf introspection trio. */
export type FormatBaseOf<T> = Extract<
  T extends string
    ? string
    : T extends number
      ? number
      : T extends bigint
        ? bigint
        : T extends globalThis.Date
          ? globalThis.Date
          : never,
  TypeFormatBase
>;

/** `T` rebuilt with the params `P` MERGED into its captured format params
 *  (`P` wins on a shared key). Base and family are preserved, so the value
 *  type can never change - only the params tighten. */
export type MergeFormat<T, P> = TypeFormat<
  FormatBaseOf<T>,
  FormatNameOf<T>,
  Prettify<Omit<FormatParamsOf<T>, keyof Mutable<P>> & Mutable<P>>
>;
