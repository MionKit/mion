// Consolidated string-format TYPE aliases — the public type surface of
// every string format (String, UUIDv4, StringDate,
// Domain, Email, …). Mocking lives in `stringFormatMock.ts`
// (one switch keyed by format name) and validation is build-time on the
// Go side; this file is type-only + the brand wiring.
//
// `TypeFormat` IS imported as a value (not `import type`): the value-level
// import keeps each brand alias's reflection metadata reachable for tsgo
// (the spec documents the same constraint).

import {TypeFormat} from '../../runtypes/typeFormat.ts';
import type {FormatPattern, StringPatternArgs} from '../../runtypes/formatPattern.ts';
// Built-in regex patterns — value import so the format types below can
// reference them by `typeof`. The Go scanner recovers {source, flags,
// mockSamples} from each const's literal type. Defined + sample-validated
// in ./string-patterns.ts.
import {
  ALPHA_PATTERN,
  ALPHANUMERIC_PATTERN,
  NUMERIC_PATTERN,
  DOMAIN_PATTERN,
  DOMAIN_UNICODE_PATTERN,
  DOMAIN_PUNYCODE_PATTERN,
  DOMAIN_NAME_PATTERN,
  DOMAIN_TLD_PATTERN,
  EMAIL_PATTERN,
  EMAIL_PUNYCODE_PATTERN,
  URL_PATTERN,
  URL_HTTP_PATTERN,
  URL_FILE_PATTERN,
  BASE64_PATTERN,
  BASE32_PATTERN,
  BASE16_PATTERN,
} from './string-patterns.ts';
import {builderResult, presetBuilder} from '../../runtypes/builderCore.ts';
import type {RunType} from '../../runtypes/types.ts';
import type {ExactParams} from '../../runtypes/builderTypes.ts';
import type {InjectRunTypeId, CompTimeArgs} from '../../markers.ts';
import type {
  StringDate,
  StringTime,
  StringDateTime,
  DateParams,
  TimeParams,
  DateTimeParams,
} from '../datetime/stringDateTimeFormats.ts';

// ─────────────────────────── StringFormat ───────────────────────────

// PatternParam — the regex a string format validates against. Either a
// `registerFormatPattern(...)` result (validates its samples at load) or an
// inline `{source, flags?, mockSamples?, message?}` literal (the
// `StringPatternArgs` shape) the Go scanner recovers directly from the property.
// `mockSamples` are optional — a pattern without them gets a deterministic
// sample pool generated from the regex at build time (declare your own to
// curate the values, or when the build reports it cannot generate for a
// construct):
//   const slug = registerFormatPattern({source: '^[a-z-]+$', mockSamples: ['a-b']});
//   type Slug = String<{pattern: typeof slug}>;
//   type Digits = String<{pattern: {source: '^[0-9]+$'}}>;
// A bare `/regex/` VALUE stays deliberately NOT accepted: `typeof /x/` is
// plain RegExp, so nothing about it survives as literal types for the
// scanner (see StringPatternArgs.exec). Built-ins encode their pattern as an
// inline `{source, flags, mockSamples}` literal — a published .d.ts can't
// carry a regex VALUE for `typeof` recovery.
export type PatternParam = FormatPattern | StringPatternArgs;

// Samples — canonical valid values for the mock generator: either an
// explicit list, or (for char-class params) a string of sample chars.
export type Samples = string | readonly string[];

// allowedChars: the value must consist entirely of `val`'s characters.
export interface AllowedCharsParam {
  val: string;
  ignoreCase?: boolean;
  errorMessage?: string;
  desc?: string;
  mockSamples?: Samples;
}

// disallowedChars: the value must contain NONE of `val`'s characters. A
// negative constraint can't be reversed, so `mockSamples` is required.
export interface DisallowedCharsParam {
  val: string;
  ignoreCase?: boolean;
  errorMessage?: string;
  desc?: string;
  mockSamples: string;
}

// allowedValues: the value must be exactly one of `val` (enum-like).
export interface AllowedValuesParam {
  val: readonly string[];
  ignoreCase?: boolean;
  errorMessage?: string;
  desc?: string;
  mockSamples?: Samples;
}

// disallowedValues: the value must be none of `val`. mockSamples required.
export interface DisallowedValuesParam {
  val: readonly string[];
  ignoreCase?: boolean;
  errorMessage?: string;
  desc?: string;
  mockSamples: Samples;
}

// StringParams — the wire-serialisable params shape for String.
// Cross-param invariants are validated build-time in Go (FMT002).
export interface StringParams {
  maxLength?: number;
  minLength?: number;
  length?: number;
  pattern?: PatternParam;
  allowedChars?: AllowedCharsParam;
  disallowedChars?: DisallowedCharsParam;
  allowedValues?: AllowedValuesParam;
  disallowedValues?: DisallowedValuesParam;
  mockSamples?: readonly string[];
  // Transformer flags — applied only by the `createFormatTransformFn<T>`
  // RT-fn, NOT by validate / validationErrors validation.
  trim?: boolean;
  lowercase?: boolean;
  uppercase?: boolean;
  capitalize?: boolean;
  // String replacement transforms (the StringTransformers): the value
  // has `searchValue` replaced with `replaceValue` (first match for
  // `replace`, every match for `replaceAll`). Applied before the
  // case/trim formatters, matching the emitFormat order.
  replace?: {searchValue: string; replaceValue: string};
  replaceAll?: {searchValue: string; replaceValue: string};
}

// StringParamsValueFirst — the value-first `string()` builder's params: identical
// to StringParams except `pattern` is typed as the plain `StringPatternArgs`
// literal (`{source, flags?, mockSamples}`). A `registerFormatPattern(...)` value
// (now a generic `FormatPattern<A>` that carries its own literals) is assignable
// here too — both forms keep source/flags/mockSamples as literal TYPES, so a
// value-first builder reflecting `T` recovers them faithfully and converges on
// the same id as the type-first `String<{pattern: typeof x}>` form.
export type StringParamsValueFirst = Omit<StringParams, 'pattern'> & {pattern?: StringPatternArgs};

// String — the branded string alias users annotate with:
// `String<{maxLength: 32}>`. `BrandName` produces a nominal type
// when needed (the convention).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type String<P extends StringParams = {}, BrandName extends string = never> = TypeFormat<
  string,
  'stringFormat',
  P,
  BrandName
>;

// Default string formats — Alpha / AlphaNumeric / Numeric (char-class
// patterns) and the Lowercase / Uppercase / Capitalize transformers.
// Alpha/AlphaNumeric/Numeric reference the registered char-class patterns
// by `typeof` (see ./string-patterns.ts).
/* eslint-disable @typescript-eslint/no-empty-object-type */
export type Alpha<P extends StringParams = {}> = TypeFormat<string, 'stringFormat', P & {pattern: typeof ALPHA_PATTERN}, never>;
export type AlphaNumeric<P extends StringParams = {}> = TypeFormat<
  string,
  'stringFormat',
  P & {pattern: typeof ALPHANUMERIC_PATTERN},
  never
>;
export type Numeric<P extends StringParams = {}> = TypeFormat<
  string,
  'stringFormat',
  P & {pattern: typeof NUMERIC_PATTERN},
  never
>;
export type Lowercase<P extends StringParams = {}> = String<P & {lowercase: true}>;
export type Uppercase<P extends StringParams = {}> = String<P & {uppercase: true}>;
export type Capitalize<P extends StringParams = {}> = String<P & {capitalize: true}>;
// contentEncoding formats — a base64/32/16-encoded string. The type-first
// spelling of JSON Schema `contentEncoding`; each rides the registered RFC 4648
// pattern so the door's `contentEncoding: 'base64'` and `TF.base64()` converge.
export type Base64<P extends StringParams = {}> = TypeFormat<string, 'stringFormat', P & {pattern: typeof BASE64_PATTERN}, never>;
export type Base32<P extends StringParams = {}> = TypeFormat<string, 'stringFormat', P & {pattern: typeof BASE32_PATTERN}, never>;
export type Base16<P extends StringParams = {}> = TypeFormat<string, 'stringFormat', P & {pattern: typeof BASE16_PATTERN}, never>;
/* eslint-enable @typescript-eslint/no-empty-object-type */

// ─────────────────────────── JsonContent ────────────────────────────
//
// A string whose content parses as JSON — the type-first spelling of JSON
// Schema `contentMediaType: 'application/json'` (optionally behind
// `contentEncoding: 'base64'`). Params mirror the schema door's lowering so
// the two authoring modes converge. `mockSamples` are id-irrelevant (they feed
// createMockDataFn only) but carried so the mock draws valid JSON either way.
/* eslint-disable @typescript-eslint/no-empty-object-type */
export type JsonContent<P extends StringParams = {}> = TypeFormat<
  string,
  'jsonContent',
  P & {json: true; mockSamples: readonly ['{}', '[]', '"text"', '7', 'true', 'null']},
  never
>;
export type JsonContentBase64<P extends StringParams = {}> = TypeFormat<
  string,
  'jsonContent',
  P & {json: true; decode: 'base64'; mockSamples: readonly ['e30=', 'W10=', 'InRleHQi', 'bnVsbA==']},
  never
>;
/* eslint-enable @typescript-eslint/no-empty-object-type */

// ─────────────────────────────── UUID ───────────────────────────────

export interface UUIDParams {
  version: '4' | '7' | 'any';
}
// Version-agnostic UUID — any RFC 9562 version (the JSON Schema `format:
// 'uuid'` meaning; the spec never pins a version).
export type UUID = TypeFormat<string, 'uuid', {version: 'any'}, never>;
export type UUIDv4 = TypeFormat<string, 'uuid', {version: '4'}, never>;
export type UUIDv7 = TypeFormat<string, 'uuid', {version: '7'}, never>;

// ──────────────────── Date / Time / DateTime ────────────────────────
//
// The string date/time/dateTime formats moved to
// `../datetime/stringDateTimeFormats.ts` (they now share the min/max
// bound params with the native `Date` family). They are re-exported from
// the `ts-runtypes/formats` subpath via `../index.ts`, so
// public imports are unchanged.

// ──────────────────────────────── IP ────────────────────────────────

export interface IPParams {
  version: 4 | 6 | 'any';
  allowLocalHost?: boolean;
  allowPort?: boolean;
}
type DEFAULT_IP_PARAMS = {version: 'any'; allowLocalHost: true};
export type IP<P extends IPParams = DEFAULT_IP_PARAMS> = TypeFormat<string, 'ip', P, never>;
export type IPv4 = IP<{version: 4; allowLocalHost: true}>;
export type IPv6 = IP<{version: 6; allowLocalHost: true}>;
export type IPWithPort = IP<{version: 'any'; allowLocalHost: true; allowPort: true}>;
export type IPv4WithPort = IP<{version: 4; allowLocalHost: true; allowPort: true}>;
export type IPv6WithPort = IP<{version: 6; allowLocalHost: true; allowPort: true}>;

// ────────────────────────────── Domain ──────────────────────────────

// DomainPartParams — the sub-validators a `names` label or the `tld`
// accepts (Omit<StringValidators, 'length'|'allowedChars'|'disallowedChars'>).
export interface DomainPartParams {
  maxLength?: number;
  minLength?: number;
  pattern?: PatternParam | {source: string; flags?: string};
  allowedValues?: AllowedValuesParam;
  disallowedValues?: DisallowedValuesParam;
  mockSamples?: Samples;
}

// DomainParams — pattern path (single baked regex) OR names+tld
// decomposition, never both (Go FMT002 enforces it).
export interface DomainParams {
  maxLength?: number;
  minLength?: number;
  maxParts?: number;
  minParts?: number;
  pattern?: {source: string; flags?: string} | {val: RegExp};
  mockSamples?: readonly string[];
  names?: DomainPartParams;
  tld?: DomainPartParams;
  // Enum-like restriction: only these exact domains validate (the build
  // already accepted it — same param family as plain string formats). Mocks
  // draw from it FIRST: a synthesized domain would fail its own validator.
  allowedValues?: AllowedValuesParam;
}

export type Domain = TypeFormat<string, 'domain', {pattern: typeof DOMAIN_PATTERN; maxLength: 253; minLength: 5}, never>;
export type DomainUnicode = TypeFormat<
  string,
  'domain',
  {pattern: typeof DOMAIN_UNICODE_PATTERN; maxLength: 253; minLength: 5},
  never
>;
export type DomainPunycode = TypeFormat<
  string,
  'domain',
  {pattern: typeof DOMAIN_PUNYCODE_PATTERN; maxLength: 253; minLength: 5},
  never
>;

export type DEFAULT_STRICT_DOMAIN_PARAMS = {
  maxParts: 6;
  minParts: 2;
  maxLength: 253;
  minLength: 5;
  names: {maxLength: 63; minLength: 2; pattern: typeof DOMAIN_NAME_PATTERN};
  tld: {maxLength: 12; minLength: 2; pattern: typeof DOMAIN_TLD_PATTERN};
};
// DomainStrict — ≤6 labels, ≥2 parts, no hyphen-edge labels,
// alphabetical tld.
export type DomainStrict = TypeFormat<string, 'domain', DEFAULT_STRICT_DOMAIN_PARAMS, never>;

// ─────────────────────────────── Email ──────────────────────────────

// EmailParams — pattern path, or localPart + domain decomposition.
export interface EmailParams {
  maxLength?: number;
  minLength?: number;
  pattern?: {source: string; flags?: string} | {val: RegExp};
  mockSamples?: readonly string[];
  localPart?: StringParams;
  domain?: DomainParams;
}

export type Email = TypeFormat<string, 'email', {pattern: typeof EMAIL_PATTERN; maxLength: 254; minLength: 7}, never>;
export type EmailPunycode = TypeFormat<
  string,
  'email',
  {pattern: typeof EMAIL_PUNYCODE_PATTERN; maxLength: 254; minLength: 7},
  never
>;

export type DEFAULT_STRICT_EMAIL_PARAMS = {
  maxLength: 254;
  localPart: {
    maxLength: 64;
    minLength: 1;
    disallowedChars: {
      val: ' ()<>[]:;\\,{}|+@';
      errorMessage: 'Invalid characters in email local part';
      mockSamples: 'abcdefghijklmnopqrstuvwxyz0123456789._-';
    };
  };
  domain: DEFAULT_STRICT_DOMAIN_PARAMS;
};
// EmailStrict — split on the last '@'; local part rejects spaces /
// brackets / aliasing chars; domain validated strictly.
export type EmailStrict = TypeFormat<string, 'email', DEFAULT_STRICT_EMAIL_PARAMS, never>;

// ──────────────────────────────── URL ───────────────────────────────

export interface UrlParams {
  pattern?: {source: string; flags?: string} | {val: RegExp};
  mockSamples?: readonly string[];
}

export type Url = TypeFormat<string, 'url', {pattern: typeof URL_PATTERN; maxLength: 2048}, never>;
export type UrlHttp = TypeFormat<string, 'url', {pattern: typeof URL_HTTP_PATTERN; maxLength: 2048}, never>;
export type UrlFile = TypeFormat<string, 'url', {pattern: typeof URL_FILE_PATTERN; maxLength: 2048}, never>;

// ───────────────────── Predefined string builders ───────────────────
//
// Value-first builder per named alias (`TF.email()` → `RunType<Email>`,
// `TF.ipv4()`, `TF.uuidv4()`, `TF.stringDate({format: 'DD-MM-YYYY'})`, …), each
// carrying the CONCRETE alias above so the value-first id converges with the
// type-first `createValidateFn<Email>()`. Two shapes: fixed presets (no params) via
// `presetBuilder`, and parameterised families (alpha / stringDate / …) with the
// no-params/plain ↔ params two-overload split. For ad-hoc constraints use
// `TF.string({…})`.

/** Alphabetic-only string (`Alpha`); `alpha({maxLength: 3})` adds bounds. **/
export function alpha(id?: InjectRunTypeId<Alpha>): RunType<Alpha>;
export function alpha<const P extends StringParams>(
  formatParams: CompTimeArgs<ExactParams<P, StringParams>>,
  id?: InjectRunTypeId<Alpha<P>>
): RunType<Alpha<P>>;
export function alpha(formatParamsOrId?: StringParams | InjectRunTypeId<Alpha>, id?: InjectRunTypeId<Alpha>): RunType<Alpha> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  const injectedId = typeof formatParamsOrId === 'string' ? formatParamsOrId : id;
  return builderResult(injectedId, {type: 'stringFormat', formatParams});
}

/** Alphanumeric-only string (`AlphaNumeric`). **/
export const alphaNumeric = presetBuilder<AlphaNumeric>('stringFormat');
/** Digits-only string (`Numeric`). **/
export const numeric = presetBuilder<Numeric>('stringFormat');
/** Base64-encoded string (`Base64`) — JSON Schema `contentEncoding: 'base64'`. **/
export const base64 = presetBuilder<Base64>('stringFormat');
/** Base32-encoded string (`Base32`) — JSON Schema `contentEncoding: 'base32'`. **/
export const base32 = presetBuilder<Base32>('stringFormat');
/** Base16 / hex-encoded string (`Base16`) — JSON Schema `contentEncoding: 'base16'`. **/
export const base16 = presetBuilder<Base16>('stringFormat');
/** A JSON-parseable string (`JsonContent`) — JSON Schema
 *  `contentMediaType: 'application/json'`. **/
export const jsonContent = presetBuilder<JsonContent>('jsonContent');
/** A base64-encoded JSON-parseable string (`JsonContentBase64`) — JSON Schema
 *  `contentMediaType: 'application/json'` + `contentEncoding: 'base64'`. **/
export const jsonContentBase64 = presetBuilder<JsonContentBase64>('jsonContent');
/** Lowercase string (`Lowercase`) — the transform applies only via
 *  `createFormatTransformFn`; validate validates it as a plain string. **/
export const lowercase = presetBuilder<Lowercase>('stringFormat');
/** Uppercase string (`Uppercase`). **/
export const uppercase = presetBuilder<Uppercase>('stringFormat');
/** Capitalized string (`Capitalize`). **/
export const capitalize = presetBuilder<Capitalize>('stringFormat');

/** Version-agnostic UUID (`UUID`). **/
export const uuid = presetBuilder<UUID>('uuid');
/** UUID v4 (`UUIDv4`). **/
export const uuidv4 = presetBuilder<UUIDv4>('uuid');
/** UUID v7 (`UUIDv7`). **/
export const uuidv7 = presetBuilder<UUIDv7>('uuid');

/** IP address, any version with localhost (`IP`). **/
export const ip = presetBuilder<IP>('ip');
/** IPv4 (`IPv4`). **/
export const ipv4 = presetBuilder<IPv4>('ip');
/** IPv6 (`IPv6`). **/
export const ipv6 = presetBuilder<IPv6>('ip');
/** IP (any) with port (`IPWithPort`). **/
export const ipWithPort = presetBuilder<IPWithPort>('ip');
/** IPv4 with port (`IPv4WithPort`). **/
export const ipv4WithPort = presetBuilder<IPv4WithPort>('ip');
/** IPv6 with port (`IPv6WithPort`). **/
export const ipv6WithPort = presetBuilder<IPv6WithPort>('ip');

/** Domain name (`Domain`). **/
export const domain = presetBuilder<Domain>('domain');
/** Unicode domain (`DomainUnicode`). **/
export const domainUnicode = presetBuilder<DomainUnicode>('domain');
/** Punycode domain (`DomainPunycode`). **/
export const domainPunycode = presetBuilder<DomainPunycode>('domain');
/** Strict domain — ≤6 labels, ≥2 parts, alphabetical tld (`DomainStrict`). **/
export const domainStrict = presetBuilder<DomainStrict>('domain');

/** Email (`Email`). **/
export const email = presetBuilder<Email>('email');
/** Punycode-domain email (`EmailPunycode`). **/
export const emailPunycode = presetBuilder<EmailPunycode>('email');
/** Strict email — strict local part + strict domain (`EmailStrict`). **/
export const emailStrict = presetBuilder<EmailStrict>('email');

/** URL (`Url`). **/
export const url = presetBuilder<Url>('url');
/** HTTP(S) URL (`UrlHttp`). **/
export const urlHttp = presetBuilder<UrlHttp>('url');
/** file:// URL (`UrlFile`). **/
export const urlFile = presetBuilder<UrlFile>('url');

/** A string-date field (`StringDate`); `stringDate({format: 'DD-MM-YYYY'})`
 *  picks the layout and may add min/max bounds. **/
export function stringDate(id?: InjectRunTypeId<StringDate>): RunType<StringDate>;
export function stringDate<const P extends Partial<DateParams>>(
  formatParams: CompTimeArgs<ExactParams<P, Partial<DateParams>>>,
  id?: InjectRunTypeId<StringDate<P>>
): RunType<StringDate<P>>;
export function stringDate(
  formatParamsOrId?: Partial<DateParams> | InjectRunTypeId<StringDate>,
  id?: InjectRunTypeId<StringDate>
): RunType<StringDate> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  const injectedId = typeof formatParamsOrId === 'string' ? formatParamsOrId : id;
  return builderResult(injectedId, {type: 'date', formatParams});
}

/** A string-time field (`StringTime`). **/
export function stringTime(id?: InjectRunTypeId<StringTime>): RunType<StringTime>;
export function stringTime<const P extends Partial<TimeParams>>(
  formatParams: CompTimeArgs<ExactParams<P, Partial<TimeParams>>>,
  id?: InjectRunTypeId<StringTime<P>>
): RunType<StringTime<P>>;
export function stringTime(
  formatParamsOrId?: Partial<TimeParams> | InjectRunTypeId<StringTime>,
  id?: InjectRunTypeId<StringTime>
): RunType<StringTime> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  const injectedId = typeof formatParamsOrId === 'string' ? formatParamsOrId : id;
  return builderResult(injectedId, {type: 'time', formatParams});
}

/** A string-dateTime field (`StringDateTime`). **/
export function stringDateTime(id?: InjectRunTypeId<StringDateTime>): RunType<StringDateTime>;
export function stringDateTime<const P extends Partial<DateTimeParams>>(
  formatParams: CompTimeArgs<ExactParams<P, Partial<DateTimeParams>>>,
  id?: InjectRunTypeId<StringDateTime<P>>
): RunType<StringDateTime<P>>;
export function stringDateTime(
  formatParamsOrId?: Partial<DateTimeParams> | InjectRunTypeId<StringDateTime>,
  id?: InjectRunTypeId<StringDateTime>
): RunType<StringDateTime> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  const injectedId = typeof formatParamsOrId === 'string' ? formatParamsOrId : id;
  return builderResult(injectedId, {type: 'dateTime', formatParams});
}
