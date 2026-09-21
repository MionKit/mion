// Value-first SCALAR LEAF builders, living beside the format TYPE aliases they converge with: a
// no-params call lands on the SAME structural id as the type-first plain type and a marker-form
// `createValidateFn<string>()`. One impl resolves the injected entry tuple as the TRAILING arg
// (`lastInjectedId`) at slot 0, 1 or 2, and the Go scanner derives the slot from the resolved
// overload's signature. The brand rides slot 1 as a `BrandArg` OBJECT so it never collides with the
// id string, and the `const` type parameters keep `{maxLength: 50}` as `50` and the brand `'Id'` as a
// string literal, so both survive into the reflected type.

import {builderResult, lastInjectedId, brand} from '../runtypes/builderCore.ts';
import type {RunType} from '../runtypes/types.ts';
import type {InjectRunTypeId, CompTimeArgs} from '../markers.ts';
import type {LeafType, BrandArg, ExactParams} from '../runtypes/builderTypes.ts';
import type {StringParams, StringParamsValueFirst} from './string/stringFormats.ts';
import type {NumberParams, Currency} from './numberFormats.ts';
import type {BigIntParams} from './bigintFormats.ts';
import type {NativeDateParams} from './datetime/dateFormats.ts';

// Re-exported from the shared builder core so the nominal-brand tag sits beside the builders it tags.
export {brand};

/** A string field builder. Params are `StringParamsValueFirst`: `pattern` is the inline
 *  `{source, flags?, mockSamples, …}` literal ONLY, never the opaque `FormatPattern` value (whose
 *  source/flags erase to `string`), so the reflected `T` keeps the pattern literals and the
 *  value-first id stays faithful. **/
export function string(id?: InjectRunTypeId<string>): RunType<string>;
export function string<const P extends StringParamsValueFirst>(
  formatParams: CompTimeArgs<ExactParams<P, StringParamsValueFirst>>,
  id?: InjectRunTypeId<LeafType<'stringFormat', P>>
): RunType<LeafType<'stringFormat', P>>;
export function string<const P extends StringParamsValueFirst, const B extends string>(
  formatParams: CompTimeArgs<ExactParams<P, StringParamsValueFirst>>,
  brandTag: BrandArg<B>,
  id?: InjectRunTypeId<LeafType<'stringFormat', P, B>>
): RunType<LeafType<'stringFormat', P, B>>;
export function string(
  formatParamsOrId?: StringParams | InjectRunTypeId<string>,
  brandOrId?: BrandArg<string> | InjectRunTypeId<string>,
  id?: InjectRunTypeId<string>
): RunType<string> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  return builderResult(lastInjectedId(formatParamsOrId, brandOrId, id), {type: 'string', formatParams});
}

/** A number field builder. **/
export function number(id?: InjectRunTypeId<number>): RunType<number>;
export function number<const P extends NumberParams>(
  formatParams: CompTimeArgs<ExactParams<P, NumberParams>>,
  id?: InjectRunTypeId<LeafType<'numberFormat', P>>
): RunType<LeafType<'numberFormat', P>>;
export function number<const P extends NumberParams, const B extends string>(
  formatParams: CompTimeArgs<ExactParams<P, NumberParams>>,
  brandTag: BrandArg<B>,
  id?: InjectRunTypeId<LeafType<'numberFormat', P, B>>
): RunType<LeafType<'numberFormat', P, B>>;
export function number(
  formatParamsOrId?: NumberParams | InjectRunTypeId<number>,
  brandOrId?: BrandArg<string> | InjectRunTypeId<number>,
  id?: InjectRunTypeId<number>
): RunType<number> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  return builderResult(lastInjectedId(formatParamsOrId, brandOrId, id), {type: 'number', formatParams});
}

/** A currency (monetary amount) field builder: `currency()` ≡ `number({isCurrency: true})`, so unlike
 *  `number()` the no-params call still carries the mark. The currency UNIT is never a param, pass it
 *  to the renderer (`createFriendlyTextI18n`'s `currency` option) instead. **/
export function currency(id?: InjectRunTypeId<Currency>): RunType<Currency>;
export function currency<const P extends NumberParams>(
  formatParams: CompTimeArgs<ExactParams<P, NumberParams>>,
  id?: InjectRunTypeId<LeafType<'numberFormat', P & {isCurrency: true}>>
): RunType<LeafType<'numberFormat', P & {isCurrency: true}>>;
export function currency<const P extends NumberParams, const B extends string>(
  formatParams: CompTimeArgs<ExactParams<P, NumberParams>>,
  brandTag: BrandArg<B>,
  id?: InjectRunTypeId<LeafType<'numberFormat', P & {isCurrency: true}, B>>
): RunType<LeafType<'numberFormat', P & {isCurrency: true}, B>>;
export function currency(
  formatParamsOrId?: NumberParams | InjectRunTypeId<number>,
  brandOrId?: BrandArg<string> | InjectRunTypeId<number>,
  id?: InjectRunTypeId<number>
): RunType<number> {
  const formatParams = typeof formatParamsOrId === 'object' ? {...formatParamsOrId, isCurrency: true} : {isCurrency: true};
  return builderResult(lastInjectedId(formatParamsOrId, brandOrId, id), {type: 'number', formatParams});
}

/** A bigint field builder. **/
export function bigInt(id?: InjectRunTypeId<bigint>): RunType<bigint>;
export function bigInt<const P extends BigIntParams>(
  formatParams: CompTimeArgs<ExactParams<P, BigIntParams>>,
  id?: InjectRunTypeId<LeafType<'bigintFormat', P>>
): RunType<LeafType<'bigintFormat', P>>;
export function bigInt<const P extends BigIntParams, const B extends string>(
  formatParams: CompTimeArgs<ExactParams<P, BigIntParams>>,
  brandTag: BrandArg<B>,
  id?: InjectRunTypeId<LeafType<'bigintFormat', P, B>>
): RunType<LeafType<'bigintFormat', P, B>>;
export function bigInt(
  formatParamsOrId?: BigIntParams | InjectRunTypeId<bigint>,
  brandOrId?: BrandArg<string> | InjectRunTypeId<bigint>,
  id?: InjectRunTypeId<bigint>
): RunType<bigint> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  return builderResult(lastInjectedId(formatParamsOrId, brandOrId, id), {type: 'bigint', formatParams});
}

/** A native-`Date` field builder. **/
export function date(id?: InjectRunTypeId<Date>): RunType<Date>;
export function date<const P extends NativeDateParams>(
  formatParams: CompTimeArgs<ExactParams<P, NativeDateParams>>,
  id?: InjectRunTypeId<LeafType<'nativeDate', P>>
): RunType<LeafType<'nativeDate', P>>;
export function date<const P extends NativeDateParams, const B extends string>(
  formatParams: CompTimeArgs<ExactParams<P, NativeDateParams>>,
  brandTag: BrandArg<B>,
  id?: InjectRunTypeId<LeafType<'nativeDate', P, B>>
): RunType<LeafType<'nativeDate', P, B>>;
export function date(
  formatParamsOrId?: NativeDateParams | InjectRunTypeId<Date>,
  brandOrId?: BrandArg<string> | InjectRunTypeId<Date>,
  id?: InjectRunTypeId<Date>
): RunType<Date> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  return builderResult(lastInjectedId(formatParamsOrId, brandOrId, id), {type: 'date', formatParams});
}
