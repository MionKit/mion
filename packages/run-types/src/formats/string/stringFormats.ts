// Consolidated string-format TYPE aliases. Mocking lives in `stringFormatMock.ts` (one switch keyed by
// format name) and validation is build-time on the Go side, so this file is type-only plus the brand
// wiring. `TypeFormat` IS imported as a value (not `import type`): the value-level import keeps each
// brand alias's reflection metadata reachable for tsgo.

import {TypeFormat} from '../../runtypes/typeFormat.ts';
import type {FormatNameOf, FormatParamsOf, FormatBrandNameOf, FormatBrand, NominalBrand} from '../../runtypes/typeFormat.ts';
import type {FormatPattern, StringPatternArgs} from '../../runtypes/formatPattern.ts';
// Type-only on purpose: a value import would ship the whole pattern table to every browser.
// The Go scanner recovers {source, flags, mockSamples} from each const's literal type.
import type {
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
  HOSTNAME_PATTERN,
  STRING_DURATION_PATTERN,
  JSON_POINTER_PATTERN,
  RELATIVE_JSON_POINTER_PATTERN,
  URI_PATTERN,
  URI_REFERENCE_PATTERN,
  IRI_PATTERN,
  IRI_REFERENCE_PATTERN,
  URI_TEMPLATE_PATTERN,
} from './string-patterns.ts';
import {builderResult, lastInjectedId, presetBuilder} from '../../runtypes/builderCore.ts';
import type {RunType} from '../../runtypes/types.ts';
import type {BrandArg, ExactParams} from '../../runtypes/builderTypes.ts';
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

// The regex a string format validates against: a `registerFormatPattern(...)` result (which validates
// its samples at load) or an inline `{source, flags?, mockSamples?, message?}` literal (the
// `StringPatternArgs` shape) the Go scanner recovers directly from the property. `mockSamples` are
// optional, a pattern without them gets a deterministic pool generated from the regex at build time
// (declare your own to curate the values, or when the build reports it cannot generate one):
//   const slug = registerFormatPattern({source: '^[a-z-]+$', mockSamples: ['a-b']});
//   type Slug = String<{pattern: typeof slug}>;
//   type Digits = String<{pattern: {source: '^[0-9]+$'}}>;
// A bare `/regex/` VALUE stays deliberately NOT accepted: `typeof /x/` is plain RegExp, so nothing
// about it survives as literal types for the scanner, and a published .d.ts cannot carry a regex VALUE
// for `typeof` recovery.
export type PatternParam = FormatPattern | StringPatternArgs;

// Canonical valid values for the mock generator: a list, or (for char-class params) sample chars.
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

// ─────────────────────────── Transforms ────────────────────────────
//
// A format's value REWRITE lives under ONE `transform` key in its params, so a reader can tell which
// part checks the value and which part changes it. It is applied only by `createFormatTransformFn<T>`
// and mion's `sanitizeParams` lane, never by validate / parse / encode / decode. The wrapper type
// `Transform<T, P>` below is the other spelling of the same key.

/** The rewrites every string-family format may declare, applied in this order: replace, replaceAll,
 *  trim, lowercase, uppercase, capitalize. The replacements go first so a second pass (mion sanitizes
 *  on the client AND the server) finds nothing left to trim. **/
export interface StringTransformParams {
  trim?: boolean;
  lowercase?: boolean;
  uppercase?: boolean;
  capitalize?: boolean;
  /** The FIRST match of `searchValue` becomes `replaceValue`. Not idempotent with several matches, so
   *  prefer `replaceAll` for a value sanitized on both the client and the server. **/
  replace?: {searchValue: string; replaceValue: string};
  /** Every match of `searchValue` becomes `replaceValue`. **/
  replaceAll?: {searchValue: string; replaceValue: string};
}

/** `CreditCard`'s bag: the string rewrites plus `stripSeparators`, which
 *  rewrites a grouped number (`4111 1111 1111 1111`) to bare digits. **/
export interface CreditCardTransformParams extends StringTransformParams {
  stripSeparators?: boolean;
}

/** Which transform bag each string-family format takes. A format missing here (uuid, the string date /
 *  time formats) takes none, so `Transform<UUIDv4, P>` is a compile error. **/
export interface TransformParamsByFormat {
  stringFormat: StringTransformParams;
  email: StringTransformParams;
  domain: StringTransformParams;
  url: StringTransformParams;
  ip: StringTransformParams;
  creditCard: CreditCardTransformParams;
}

/** The transform params `T` accepts: its format's bag, `StringTransformParams`
 *  for a plain `string`, `never` for a format that has no transform. **/
export type TransformParamsOf<T> = [FormatNameOf<T>] extends [never]
  ? StringTransformParams
  : FormatNameOf<T> extends keyof TransformParamsByFormat
    ? TransformParamsByFormat[FormatNameOf<T>]
    : never;

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
  // JSON Schema content keywords: `contentEncoding` says how the string is encoded, `contentMediaType`
  // what the DECODED content is, so with both the value must decode AND parse. Ordinary string
  // keywords, there is no separate content FORMAT.
  contentEncoding?: 'base64' | 'base32' | 'base16';
  contentMediaType?: 'application/json';
  // Applied only by `createFormatTransformFn<T>` and mion's `sanitizeParams`, NOT by validate.
  transform?: StringTransformParams;
}

// The value-first `string()` builder's params: `pattern` typed as the plain `StringPatternArgs`
// literal, to which a `registerFormatPattern(...)` value is assignable too. Both forms keep
// source/flags/mockSamples as literal TYPES, so the builder recovers them faithfully and converges on
// the same id as the type-first `String<{pattern: typeof x}>` form.
export type StringParamsValueFirst = Omit<StringParams, 'pattern'> & {pattern?: StringPatternArgs};

// The branded string alias users annotate with, e.g. `String<{maxLength: 32}>`.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type String<P extends StringParams = {}, BrandName extends string = never> = TypeFormat<
  string,
  'stringFormat',
  P,
  BrandName
>;

// Alpha / AlphaNumeric / Numeric reference the registered char-class patterns by `typeof`
// (see ./string-patterns.ts).
/* eslint-disable @typescript-eslint/no-empty-object-type */
export type Alpha<P extends Override<StringParams, 'pattern'> = {}> = PresetFormat<
  'stringFormat',
  {pattern: typeof ALPHA_PATTERN},
  P
>;
export type AlphaNumeric<P extends Override<StringParams, 'pattern'> = {}> = PresetFormat<
  'stringFormat',
  {pattern: typeof ALPHANUMERIC_PATTERN},
  P
>;
export type Numeric<P extends Override<StringParams, 'pattern'> = {}> = PresetFormat<
  'stringFormat',
  {pattern: typeof NUMERIC_PATTERN},
  P
>;
// The case presets pin `transform`: a caller's `transform` would REPLACE the whole block (params merge
// key by key), so a combined rewrite is spelled `String<{transform: {lowercase: true; trim: true}}>`.
export type Lowercase<P extends Override<StringParams, 'transform'> = {}> = PresetFormat<
  'stringFormat',
  {transform: {lowercase: true}},
  P
>;
export type Uppercase<P extends Override<StringParams, 'transform'> = {}> = PresetFormat<
  'stringFormat',
  {transform: {uppercase: true}},
  P
>;
export type Capitalize<P extends Override<StringParams, 'transform'> = {}> = PresetFormat<
  'stringFormat',
  {transform: {capitalize: true}},
  P
>;
// The type-first spelling of JSON Schema `contentEncoding`: each rides the registered RFC 4648 pattern
// so the door's `contentEncoding: 'base64'` and `TF.base64()` converge.
export type Base64<P extends Override<StringParams, 'pattern'> = {}> = PresetFormat<
  'stringFormat',
  {pattern: typeof BASE64_PATTERN},
  P
>;
export type Base32<P extends Override<StringParams, 'pattern'> = {}> = PresetFormat<
  'stringFormat',
  {pattern: typeof BASE32_PATTERN},
  P
>;
export type Base16<P extends Override<StringParams, 'pattern'> = {}> = PresetFormat<
  'stringFormat',
  {pattern: typeof BASE16_PATTERN},
  P
>;
/* eslint-enable @typescript-eslint/no-empty-object-type */

// ─────────────────────────── JsonContent ────────────────────────────
//
// A string whose content parses as JSON, the type-first spelling of JSON Schema
// `contentMediaType: 'application/json'` (optionally behind `contentEncoding: 'base64'`). NOT a format
// of its own: these are `String` aliases over the two content keywords, mirroring the schema
// translation's lowering so the two authoring modes converge. `mockSamples` are id-irrelevant (they
// feed createMockDataFn only) and span what a JSON payload actually looks like, escapes and non-ASCII
// text included, so a mock consumer meets real escaping instead of only `{}`.
type DEFAULT_JSON_CONTENT_PARAMS = {
  contentMediaType: 'application/json';
  mockSamples: readonly [
    '{}',
    '[]',
    'null',
    '{"id":42,"name":"Ada Lovelace","active":true,"score":-1500}',
    '{"user":{"id":7,"roles":["admin","editor"],"meta":{"seen":null}}}',
    '[{"sku":"A-1","qty":2},{"sku":"B-7","qty":11}]',
    '{"text":"quote \\" backslash \\\\ newline \\n","unicode":"héllo ✓"}',
  ];
};
// The same span of documents, base64-encoded; the last is multi-byte UTF-8, so it exercises the decode
// step rather than just the parse step.
type DEFAULT_JSON_CONTENT_BASE64_PARAMS = {
  contentEncoding: 'base64';
  contentMediaType: 'application/json';
  mockSamples: readonly [
    'e30=',
    'W10=',
    'eyJpZCI6NDIsIm5hbWUiOiJBZGEgTG92ZWxhY2UiLCJhY3RpdmUiOnRydWV9',
    'eyJ1c2VyIjp7ImlkIjo3LCJyb2xlcyI6WyJhZG1pbiIsImVkaXRvciJdfX0=',
    'W3sic2t1IjoiQS0xIiwicXR5IjoyfSx7InNrdSI6IkItNyIsInF0eSI6MTF9XQ==',
    'eyJ1bmljb2RlIjoiaMOpbGxvIOKckyIsIm5pbCI6bnVsbH0=',
  ];
};
/* eslint-disable @typescript-eslint/no-empty-object-type */
export type JsonContent<P extends Override<StringParams> = {}> = PresetFormat<'stringFormat', DEFAULT_JSON_CONTENT_PARAMS, P>;
export type JsonContentBase64<P extends Override<StringParams> = {}> = PresetFormat<
  'stringFormat',
  DEFAULT_JSON_CONTENT_BASE64_PARAMS,
  P
>;
/* eslint-enable @typescript-eslint/no-empty-object-type */

// ─────────────────────────────── UUID ───────────────────────────────

export interface UUIDParams {
  /** Which UUID version the validator pins. `'4'` / `'7'` additionally require that exact digit in the
   *  version slot (index 14). `'any'` does NOT skip validation: it checks the full RFC 9562 string
   *  layout (36 characters, hyphens at 8/13/18/23, a hex digit everywhere else) and reads the version
   *  slot as an ordinary hex digit, which is what JSON Schema `format: 'uuid'` means: the RFC's grammar
   *  carries no version constraint, and §5.9 / §5.10 make the Nil and Max UUIDs valid, whose version
   *  slots name no version. Defaulting the bare `UUID` to a pinned version would REJECT valid UUIDs,
   *  every v1 and v7 value included. Pin a version only to exclude the others. **/
  version: '4' | '7' | 'any';
}
// Version-agnostic UUID: any RFC 9562 version (UUIDParams.version says exactly what is checked).
export type UUID = TypeFormat<string, 'uuid', {version: 'any'}, never>;
export type UUIDv4 = TypeFormat<string, 'uuid', {version: '4'}, never>;
export type UUIDv7 = TypeFormat<string, 'uuid', {version: '7'}, never>;

// ──────────────────── Date / Time / DateTime ────────────────────────
// The string date/time/dateTime formats live in `../datetime/stringDateTimeFormats.ts`, sharing the
// min/max bound params with the native `Date` family, and are re-exported via `../index.ts`.

// ──────────────────────────────── IP ────────────────────────────────

/** The failure modes an `ip` format reports in `TypeFormatError.errorType`,
 *  ONLY when `allowPort` is on: `'address'` (not an address of the accepted
 *  version) or `'port'` (a good address, a port that is not digits or is over
 *  65535). Without `allowPort` there is one way to fail and the field stays
 *  unset. Under `version: 'any'` a port complaint from either parser wins. **/
export type IpErrorType = 'address' | 'port';

/** Params for the `ip` family. With `allowPort` a failing value reports WHICH
 *  half failed in the error's `errorType`, one of `IpErrorType`. **/
export interface IPParams {
  version: 4 | 6 | 'any';
  allowLocalHost?: boolean;
  allowPort?: boolean;
  /** Value rewrite (`{lowercase: true}` canonicalises IPv6 hex digits). Off by default. **/
  transform?: StringTransformParams;
}
// The version-pinned aliases pin `version`: `ipv4({version: 6})` would just be `ipv6()` wearing the
// wrong name. `allowLocalHost` is OFF by default on every IP preset, since these formats describe an
// ADDRESS, so the hostname spelling "localhost" is opt-in rather than silently accepted. It never gates
// the loopback ADDRESSES, `127.0.0.1` and `::1` are well-formed and pass on their own. That is also
// what JSON Schema's `ipv4` / `ipv6` format keywords mean, so the schema door needs no override.
type DEFAULT_IP_PARAMS = {version: 'any'; allowLocalHost: false};
type DEFAULT_IPV4_PARAMS = {version: 4; allowLocalHost: false};
type DEFAULT_IPV6_PARAMS = {version: 6; allowLocalHost: false};
type DEFAULT_IP_PORT_PARAMS = {version: 'any'; allowLocalHost: false; allowPort: true};
type DEFAULT_IPV4_PORT_PARAMS = {version: 4; allowLocalHost: false; allowPort: true};
type DEFAULT_IPV6_PORT_PARAMS = {version: 6; allowLocalHost: false; allowPort: true};
/* eslint-disable @typescript-eslint/no-empty-object-type */
export type IP<P extends Override<IPParams> = {}> = PresetFormat<'ip', DEFAULT_IP_PARAMS, P>;
export type IPv4<P extends Override<IPParams, 'version'> = {}> = PresetFormat<'ip', DEFAULT_IPV4_PARAMS, P>;
export type IPv6<P extends Override<IPParams, 'version'> = {}> = PresetFormat<'ip', DEFAULT_IPV6_PARAMS, P>;
export type IPWithPort<P extends Override<IPParams, 'allowPort'> = {}> = PresetFormat<'ip', DEFAULT_IP_PORT_PARAMS, P>;
export type IPv4WithPort<P extends Override<IPParams, 'version' | 'allowPort'> = {}> = PresetFormat<
  'ip',
  DEFAULT_IPV4_PORT_PARAMS,
  P
>;
export type IPv6WithPort<P extends Override<IPParams, 'version' | 'allowPort'> = {}> = PresetFormat<
  'ip',
  DEFAULT_IPV6_PORT_PARAMS,
  P
>;
/* eslint-enable @typescript-eslint/no-empty-object-type */

// ────────────────────────────── Domain ──────────────────────────────

// The sub-validators a `names` label or the `tld` accepts.
export interface DomainPartParams {
  maxLength?: number;
  minLength?: number;
  pattern?: PatternParam | {source: string; flags?: string};
  allowedValues?: AllowedValuesParam;
  disallowedValues?: DisallowedValuesParam;
  mockSamples?: Samples;
}

/** Which rule a `domain` value broke, in `TypeFormatError.errorType`; the pattern path (`Domain`) never sets it.
 *  IDNA path (`Hostname` / `IdnHostname`): 'label', 'punycode' (undecodable or non-canonical `xn--`), 'bidi', 'length'.
 *  Parts path (`DomainParts`): 'label' or 'tld'; whole-name bounds leave it unset, `formatPath` names them. **/
export type DomainErrorType = 'label' | 'tld' | 'punycode' | 'bidi' | 'length';

// The quick road: one regex plus whole-value checks; the split keys live on `DomainPartsParams` only.
/** A failure names the part in `errorType`, see `DomainErrorType`. **/
export interface DomainParams {
  maxLength?: number;
  minLength?: number;
  pattern?: PatternParam | {val: RegExp};
  mockSamples?: readonly string[];
  // Mocks draw from it first: a synthesized domain would fail its own validator.
  allowedValues?: AllowedValuesParam;
  /** Value rewrite (`{lowercase: true}` is the usual one). Off by default. **/
  transform?: StringTransformParams;
}

// The parts road: split on '.' and check each label and the tld. Never with `pattern` (Go FMT002).
export interface DomainPartsParams extends DomainParams {
  maxParts?: number;
  minParts?: number;
  names?: DomainPartParams;
  tld?: DomainPartParams;
}

type DEFAULT_DOMAIN_PARAMS = {pattern: typeof DOMAIN_PATTERN; maxLength: 253; minLength: 5};
type DEFAULT_DOMAIN_UNICODE_PARAMS = {pattern: typeof DOMAIN_UNICODE_PATTERN; maxLength: 253; minLength: 5};
type DEFAULT_DOMAIN_PUNYCODE_PARAMS = {pattern: typeof DOMAIN_PUNYCODE_PATTERN; maxLength: 253; minLength: 5};
/* eslint-disable @typescript-eslint/no-empty-object-type */
// `Domain` leaves `pattern` overridable on purpose (a caller's own domain regex is a supported use);
// the script-specific variants pin it, since replacing it is exactly `Domain<{pattern}>`.
export type Domain<P extends Override<DomainParams> = {}> = PresetFormat<'domain', DEFAULT_DOMAIN_PARAMS, P>;
export type DomainUnicode<P extends Override<DomainParams, 'pattern'> = {}> = PresetFormat<
  'domain',
  DEFAULT_DOMAIN_UNICODE_PARAMS,
  P
>;
export type DomainPunycode<P extends Override<DomainParams, 'pattern'> = {}> = PresetFormat<
  'domain',
  DEFAULT_DOMAIN_PUNYCODE_PARAMS,
  P
>;
/* eslint-enable @typescript-eslint/no-empty-object-type */

export type DEFAULT_DOMAIN_PARTS_PARAMS = {
  maxParts: 6;
  minParts: 2;
  maxLength: 253;
  minLength: 5;
  names: {maxLength: 63; minLength: 2; pattern: typeof DOMAIN_NAME_PATTERN};
  tld: {maxLength: 12; minLength: 2; pattern: typeof DOMAIN_TLD_PATTERN};
};
// Rejects hyphen-edge labels. names/tld ARE the format, so only those two stay pinned.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type DomainParts<P extends Override<DomainPartsParams, 'names' | 'tld'> = {}> = PresetFormat<
  'domain',
  DEFAULT_DOMAIN_PARTS_PARAMS,
  P
>;

// A defaults bag with an override P layered on top (P's keys win), which is what lets a partial
// override keep the built-in pattern + bounds: `Email<{maxLength: 100}>` replaces only `maxLength`.
// The schema door rides the SAME merge, so the two authoring modes converge on one id. Fast path
// FIRST: with no override the defaults bag is handed back untouched, so a bare preset keeps the id it
// had before it became overridable and costs 10 instantiations instead of 13, which the whole JSON
// Schema format-lookup table would otherwise pay per row. The merge itself is ONE mapped pass over the
// combined key set: 15 instantiations per override against the 19 of `Simplify<Omit<Defaults, keyof P>
// & P>`.
type FormatDefaults<Defaults extends object, P> = [keyof P] extends [never]
  ? Defaults
  : {[K in keyof Defaults | keyof P]: K extends keyof P ? P[K] : K extends keyof Defaults ? Defaults[K] : never};

/** A predefined string format: the Go format `Tag`, the params the preset bakes in, and whatever the
 *  caller layers on top. EVERY named string format below is spelled through this, so "which keywords
 *  can this one override?" has one answer, all of them, instead of a different answer per name. **/
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type PresetFormat<Tag extends string, Defaults extends object, P = {}> = TypeFormat<
  string,
  Tag,
  FormatDefaults<Defaults, P>,
  never
>;

/** What a preset accepts as an override: its params family, minus the key(s) that ARE the preset's
 *  identity. `stringUrlHttp({maxLength: 100})` retunes the bound, while swapping its pattern is just
 *  `stringUrl({pattern})` under a misleading name, so the pinned key is rejected at the call site instead of
 *  quietly producing a format whose name no longer describes it. **/
// Instantiated per call site (it rides every preset alias's generic bound), so keep it to one pass over Params.
export type Override<Params, Pinned extends keyof Params = never> = Omit<Partial<Params>, Pinned>;

/** `T` with its value rewrite set to `P`, the wrapper spelling of the nested `transform` param:
 *  `Transform<Email, {lowercase: true}>` IS `Email<{transform: {lowercase: true}}>` (same base, same
 *  format name, params merged, the same nominal brand if `T` carried one), so both spellings resolve
 *  to one structural id. Over a plain `string` it is `String<{transform: P}>`, and it REPLACES any
 *  `transform` `T` declared: `Transform<Lowercase, {trim: true}>` trims and no longer lowercases. **/
export type Transform<T extends string, P extends TransformParamsOf<T>> = [FormatNameOf<T>] extends [never]
  ? TypeFormat<string, 'stringFormat', {transform: P}, never>
  : TypeFormat<string, FormatNameOf<T>, FormatDefaults<FormatParamsOf<T> & object, {transform: P}>, FormatBrandNameOf<T>>;

// ─────────────────────────────── Email ──────────────────────────────

/** Which part of an `email` is wrong, in `TypeFormatError.errorType`; the pattern path (`Email`) never sets it.
 *  RFC path (`EmailAddress` / `IdnEmail`): 'format' (no `@`), 'localPart', 'domain', 'addressLiteral', 'length'.
 *  Parts path (`EmailParts`): 'format' or 'localPart'; the domain half reports as `domain` with its own `DomainErrorType`.
 *  Whole-address bounds leave it unset, `formatPath` names them. **/
export type EmailErrorType = 'format' | 'localPart' | 'domain' | 'addressLiteral' | 'length';

// The quick road: one regex, or the RFC presets' `emailRfc` engine; the split keys live on `EmailPartsParams` only.
/** A failure names the part in `errorType`, see `EmailErrorType`. **/
export interface EmailParams {
  maxLength?: number;
  minLength?: number;
  pattern?: PatternParam | {val: RegExp};
  mockSamples?: readonly string[];
  /** Usually `{trim: true, lowercase: true}`; off by default since the RFC makes the local part case-sensitive. **/
  transform?: StringTransformParams;
}

// The parts road: split on the last '@'; the domain half may split again.
export interface EmailPartsParams extends EmailParams {
  localPart?: StringParams;
  domain?: DomainPartsParams;
}

type DEFAULT_EMAIL_PARAMS = {pattern: typeof EMAIL_PATTERN; maxLength: 254; minLength: 7};
// The RFC 5321 pair: `TF.Email` above is the everyday shape (a dotted domain, a plain local part),
// while these two are what the JSON Schema keywords mean and accept the whole grammar, quoted local
// parts and address literals included, plus any script for the idn twin.
type DEFAULT_EMAIL_ADDRESS_PARAMS = {
  emailRfc: 'ascii';
  maxLength: 254;
  mockSamples: ['joe.bloggs@example.com', 'jane@mion.io', 'contact@test.org'];
};
type DEFAULT_IDN_EMAIL_PARAMS = {
  emailRfc: 'unicode';
  maxLength: 254;
  mockSamples: ['joe.bloggs@example.com', 'δοκιμή@example.com'];
};
type DEFAULT_EMAIL_PUNYCODE_PARAMS = {pattern: typeof EMAIL_PUNYCODE_PATTERN; maxLength: 254; minLength: 7};
/* eslint-disable @typescript-eslint/no-empty-object-type */
export type Email<P extends Override<EmailParams> = {}> = PresetFormat<'email', DEFAULT_EMAIL_PARAMS, P>;
/** Full RFC 5321 address, what `format: 'email'` means: quoted local parts and address literals pass.
 *  Like `Email`, a named domain must be dotted (`joe@tld` is RFC-legal but rejected). **/
export type EmailAddress<P extends Override<EmailParams, 'pattern'> = {}> = PresetFormat<
  'email',
  DEFAULT_EMAIL_ADDRESS_PARAMS,
  P
>;
/** The same grammar in any script, what `format: 'idn-email'` means. **/
export type IdnEmail<P extends Override<EmailParams, 'pattern'> = {}> = PresetFormat<'email', DEFAULT_IDN_EMAIL_PARAMS, P>;
export type EmailPunycode<P extends Override<EmailParams, 'pattern'> = {}> = PresetFormat<
  'email',
  DEFAULT_EMAIL_PUNYCODE_PARAMS,
  P
>;
/* eslint-enable @typescript-eslint/no-empty-object-type */

export type DEFAULT_EMAIL_PARTS_PARAMS = {
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
  domain: DEFAULT_DOMAIN_PARTS_PARAMS;
};
// The split IS the format, so both halves stay pinned.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type EmailParts<P extends Override<EmailPartsParams, 'localPart' | 'domain'> = {}> = PresetFormat<
  'email',
  DEFAULT_EMAIL_PARTS_PARAMS,
  P
>;

// ──────────────────────────────── URL ───────────────────────────────

export interface UrlParams {
  maxLength?: number;
  minLength?: number;
  pattern?: PatternParam | {val: RegExp};
  mockSamples?: readonly string[];
  /** Value rewrite. Off by default: a URL path is case-sensitive, so a blanket
   *  `lowercase` is a field's decision. **/
  transform?: StringTransformParams;
}

// ── JSON Schema named formats ──
// Each is the shape its `format` keyword lowers to, riding the existing 'url' / 'stringFormat'
// emitters (a pattern plus optional length bounds is all they need), so no new Go emitter with them.
type DEFAULT_URI_PARAMS = {pattern: typeof URI_PATTERN};
type DEFAULT_URI_REFERENCE_PARAMS = {pattern: typeof URI_REFERENCE_PATTERN};
type DEFAULT_IRI_PARAMS = {pattern: typeof IRI_PATTERN};
type DEFAULT_IRI_REFERENCE_PARAMS = {pattern: typeof IRI_REFERENCE_PATTERN};
type DEFAULT_URI_TEMPLATE_PARAMS = {pattern: typeof URI_TEMPLATE_PATTERN};
// `idna` routes the check to the pure-fn engine instead of a pattern: an `xn--` label has to be
// decoded before its characters can be judged. 'ascii' is the RFC 1123 host name, 'unicode' also
// accepts the U-label spelling. HOSTNAME_PATTERN stays on the ASCII preset for its mock pool.
type DEFAULT_HOSTNAME_PARAMS = {pattern: typeof HOSTNAME_PATTERN; maxLength: 253; idna: 'ascii'};
type DEFAULT_IDN_HOSTNAME_PARAMS = {maxLength: 253; idna: 'unicode'};
type DEFAULT_STRING_DURATION_PARAMS = {pattern: typeof STRING_DURATION_PATTERN};
// No pattern: whether a string compiles as a regular expression is a question only the engine can
// answer, so the check is a pure fn and the pool is declared (nothing can be generated from it).
type DEFAULT_REGEX_PARAMS = {
  isRegex: true;
  mockSamples: ['^[a-z]+$', '\\d{4}-\\d{2}-\\d{2}', '(foo|bar)+', '^.*$'];
};
type DEFAULT_JSON_POINTER_PARAMS = {pattern: typeof JSON_POINTER_PATTERN};
type DEFAULT_RELATIVE_JSON_POINTER_PARAMS = {pattern: typeof RELATIVE_JSON_POINTER_PATTERN};

type DEFAULT_URL_PARAMS = {pattern: typeof URL_PATTERN; maxLength: 2048};
type DEFAULT_URL_HTTP_PARAMS = {pattern: typeof URL_HTTP_PATTERN; maxLength: 2048};
type DEFAULT_URL_FILE_PARAMS = {pattern: typeof URL_FILE_PATTERN; maxLength: 2048};
/* eslint-disable @typescript-eslint/no-empty-object-type */
export type StringUrl<P extends Override<UrlParams> = {}> = PresetFormat<'url', DEFAULT_URL_PARAMS, P>;
export type StringUrlHttp<P extends Override<UrlParams, 'pattern'> = {}> = PresetFormat<'url', DEFAULT_URL_HTTP_PARAMS, P>;
export type StringUrlFile<P extends Override<UrlParams, 'pattern'> = {}> = PresetFormat<'url', DEFAULT_URL_FILE_PARAMS, P>;

// ───────────────────────────── URL objects ──────────────────────────
// A URL object travels as its href, rebuilt with `new URL()`; length and pattern params check the href.
// No `transform`: a URL object is never rewritten.

/** Read off `globalThis` so the published `.d.ts` needs neither `dom` nor `@types/node`; `never` without them. **/
type UrlInstance = typeof globalThis extends {URL: {prototype: infer I}} ? I : never;
export type UrlObjectParams = Omit<UrlParams, 'transform'>;
/** The brand is written inline, not through `TypeFormat`, so the root `TypeFormatBase` never names `URL`. **/
export type UrlObjectFormat<P extends object, BrandName extends string = never> = UrlInstance &
  FormatBrand<'nativeUrl', P> &
  ([BrandName] extends [never] ? unknown : NominalBrand<BrandName>);
/** A URL object, `Url<{maxLength: 200}>`; no pattern by default, so any URL `new URL()` accepts passes. **/
export type Url<P extends UrlObjectParams = {}, BrandName extends string = never> = UrlObjectFormat<P, BrandName>;
/** An HTTP(S) URL object, the `StringUrlHttp` defaults over its href. **/
export type UrlHttp<P extends Override<UrlObjectParams, 'pattern'> = {}> = UrlObjectFormat<
  FormatDefaults<DEFAULT_URL_HTTP_PARAMS, P>
>;
/** A file:// URL object, the `StringUrlFile` defaults over its href. **/
export type UrlFile<P extends Override<UrlObjectParams, 'pattern'> = {}> = UrlObjectFormat<
  FormatDefaults<DEFAULT_URL_FILE_PARAMS, P>
>;

/** Any RFC 3986 URI, whatever the scheme (`mailto:`, `urn:`, `tel:`) — what
 *  `format: 'uri'` means. `StringUrl` is the narrower web-address form. **/
export type Uri<P extends Override<UrlParams, 'pattern'> = {}> = PresetFormat<'url', DEFAULT_URI_PARAMS, P>;
/** An RFC 3986 URI reference: a URI, or a relative one like `../a` or `#frag`. **/
export type UriReference<P extends Override<UrlParams, 'pattern'> = {}> = PresetFormat<'url', DEFAULT_URI_REFERENCE_PARAMS, P>;
/** RFC 3987 IRI — a URI whose characters may be non-ASCII. **/
export type Iri<P extends Override<UrlParams, 'pattern'> = {}> = PresetFormat<'url', DEFAULT_IRI_PARAMS, P>;
/** An IRI reference: an IRI, or a relative one. **/
export type IriReference<P extends Override<UrlParams, 'pattern'> = {}> = PresetFormat<'url', DEFAULT_IRI_REFERENCE_PARAMS, P>;
/** RFC 6570 URI template — a URI with `{…}` expressions left to fill in. **/
export type UriTemplate<P extends Override<UrlParams, 'pattern'> = {}> = PresetFormat<'url', DEFAULT_URI_TEMPLATE_PARAMS, P>;
/** RFC 1123 host name. Unlike `Domain` a single label is fine (`localhost`),
 *  since a host name need not be a dotted public name. An `xn--` label is
 *  decoded and checked against the IDNA rules rather than taken on trust. **/
export type Hostname<P extends Override<DomainParams, 'pattern'> = {}> = PresetFormat<'domain', DEFAULT_HOSTNAME_PARAMS, P>;
/** Internationalized host name (RFC 5890) — the same rules as `Hostname` plus
 *  labels written in their own script (`実例.テスト`), including the contextual and
 *  bidirectional rules those bring with them. **/
export type IdnHostname<P extends Override<DomainParams, 'pattern'> = {}> = PresetFormat<
  'domain',
  DEFAULT_IDN_HOSTNAME_PARAMS,
  P
>;
/** RFC 3339 duration string (`P4DT12H30M5S`). A LENGTH of time, so it is not
 *  one of the Date/Time formats and takes no min/max bounds; those describe an
 *  instant. Note this grammar is stricter than the `now±P…` bound specs. **/
export type StringDuration<P extends Override<StringParams, 'pattern'> = {}> = PresetFormat<
  'stringFormat',
  DEFAULT_STRING_DURATION_PARAMS,
  P
>;
/** A string that is itself a usable ECMA-262 regular expression — what
 *  `format: 'regex'` asserts. Not to be confused with the `pattern` param,
 *  which is a regex the VALUE must match; here the value IS the regex. **/
export type RegexString<P extends Override<StringParams, 'pattern'> = {}> = PresetFormat<'stringFormat', DEFAULT_REGEX_PARAMS, P>;
/** RFC 6901 JSON pointer (`/store/book/0/title`). The empty string is the
 *  whole document, and so is valid. **/
export type JsonPointer<P extends Override<StringParams, 'pattern'> = {}> = PresetFormat<
  'stringFormat',
  DEFAULT_JSON_POINTER_PARAMS,
  P
>;
/** RFC 6901 relative JSON pointer (`1/foo`, `2#`) — a hop count, then either a
 *  pointer or `#` for the key it landed on. **/
export type RelativeJsonPointer<P extends Override<StringParams, 'pattern'> = {}> = PresetFormat<
  'stringFormat',
  DEFAULT_RELATIVE_JSON_POINTER_PARAMS,
  P
>;
/* eslint-enable @typescript-eslint/no-empty-object-type */

// ───────────────────── Predefined string builders ───────────────────
// Value-first builder per named alias, each carrying the CONCRETE alias above so the value-first id
// converges with the type-first `createValidateFn<Email>()`. EVERY predefined string builder takes the
// SAME optional params bag its type does, layered over that preset's own defaults:
// `stringUrlHttp({maxLength: 100})` keeps the HTTP(S) pattern and replaces only the bound. The one exception
// is the UUID family, whose only param is the version each alias exists to pin. For constraints no
// preset covers, use `TF.string({…})`.

/** The call shape every predefined string builder shares. **/
export interface PresetFormatBuilder<Tag extends string, Defaults extends object, Params> {
  (id?: InjectRunTypeId<PresetFormat<Tag, Defaults>>): RunType<PresetFormat<Tag, Defaults>>;
  <const P extends Params>(
    formatParams: CompTimeArgs<ExactParams<P, Params>>,
    id?: InjectRunTypeId<PresetFormat<Tag, Defaults, P>>
  ): RunType<PresetFormat<Tag, Defaults, P>>;
}

/** One implementation behind all of them. The first argument is a params bag only when it is a
 *  non-array object: an ARRAY there is an injected entry-module id, the same line compose.ts draws. **/
export function presetFormatBuilder<Tag extends string, Defaults extends object, Params>(
  tag: Tag
): PresetFormatBuilder<Tag, Defaults, Params> {
  return ((formatParamsOrId?: Params | InjectRunTypeId<unknown>, id?: InjectRunTypeId<unknown>) => {
    const isParams = typeof formatParamsOrId === 'object' && formatParamsOrId !== null && !Array.isArray(formatParamsOrId);
    const injectedId = isParams ? id : ((formatParamsOrId as InjectRunTypeId<unknown> | undefined) ?? id);
    return builderResult(injectedId, {type: tag, formatParams: isParams ? formatParamsOrId : {}});
  }) as PresetFormatBuilder<Tag, Defaults, Params>;
}

/** Alphabetic-only string (`Alpha`); `alpha({maxLength: 3})` adds bounds. **/
export const alpha = presetFormatBuilder<'stringFormat', {pattern: typeof ALPHA_PATTERN}, Override<StringParams, 'pattern'>>(
  'stringFormat'
);
/** Alphanumeric-only string (`AlphaNumeric`). **/
export const alphaNumeric = presetFormatBuilder<
  'stringFormat',
  {pattern: typeof ALPHANUMERIC_PATTERN},
  Override<StringParams, 'pattern'>
>('stringFormat');
/** Digits-only string (`Numeric`). **/
export const numeric = presetFormatBuilder<'stringFormat', {pattern: typeof NUMERIC_PATTERN}, Override<StringParams, 'pattern'>>(
  'stringFormat'
);
/** Base64-encoded string (`Base64`) — JSON Schema `contentEncoding: 'base64'`. **/
export const base64 = presetFormatBuilder<'stringFormat', {pattern: typeof BASE64_PATTERN}, Override<StringParams, 'pattern'>>(
  'stringFormat'
);
/** Base32-encoded string (`Base32`) — JSON Schema `contentEncoding: 'base32'`. **/
export const base32 = presetFormatBuilder<'stringFormat', {pattern: typeof BASE32_PATTERN}, Override<StringParams, 'pattern'>>(
  'stringFormat'
);
/** Base16 / hex-encoded string (`Base16`) — JSON Schema `contentEncoding: 'base16'`. **/
export const base16 = presetFormatBuilder<'stringFormat', {pattern: typeof BASE16_PATTERN}, Override<StringParams, 'pattern'>>(
  'stringFormat'
);
/** A JSON-parseable string (`JsonContent`) — JSON Schema
 *  `contentMediaType: 'application/json'`. **/
export const jsonContent = presetFormatBuilder<'stringFormat', DEFAULT_JSON_CONTENT_PARAMS, Override<StringParams>>(
  'stringFormat'
);
/** A base64-encoded JSON-parseable string (`JsonContentBase64`) — JSON Schema
 *  `contentMediaType: 'application/json'` + `contentEncoding: 'base64'`. **/
export const jsonContentBase64 = presetFormatBuilder<'stringFormat', DEFAULT_JSON_CONTENT_BASE64_PARAMS, Override<StringParams>>(
  'stringFormat'
);
/** Lowercase string (`Lowercase`). The rewrite is applied only by `createFormatTransformFn` and mion's
 *  `sanitizeParams`; validate accepts any case. **/
export const lowercase = presetFormatBuilder<'stringFormat', {transform: {lowercase: true}}, Override<StringParams, 'transform'>>(
  'stringFormat'
);
/** Uppercase string (`Uppercase`). **/
export const uppercase = presetFormatBuilder<'stringFormat', {transform: {uppercase: true}}, Override<StringParams, 'transform'>>(
  'stringFormat'
);
/** Capitalized string (`Capitalize`). **/
export const capitalize = presetFormatBuilder<
  'stringFormat',
  {transform: {capitalize: true}},
  Override<StringParams, 'transform'>
>('stringFormat');

/** Value-first twin of `Transform<T, P>`, converging on the type-first id; over `TF.string()` it is a
 *  `String<{transform: P}>`. Only this outer call resolves an id, the inner builder is the leaf. **/
export function transform<T extends string, const P extends TransformParamsOf<T>>(
  runType: RunType<T>,
  transformParams: CompTimeArgs<ExactParams<P, TransformParamsOf<T>>>,
  id?: InjectRunTypeId<Transform<T, P>>
): RunType<Transform<T, P>> {
  return builderResult(id, {type: 'transform', formatParams: {transform: transformParams}, inner: runType});
}

// The UUID builders take no params, deliberately: `version` is UUIDParams' only member and each alias
// exists to pin it, so an override could only ever turn one alias into another.
/** Version-agnostic UUID (`UUID`). **/
export const uuid = presetBuilder<UUID>('uuid');
/** UUID v4 (`UUIDv4`). **/
export const uuidv4 = presetBuilder<UUIDv4>('uuid');
/** UUID v7 (`UUIDv7`). **/
export const uuidv7 = presetBuilder<UUIDv7>('uuid');

/** IP address, any version (`IP`); `ip({allowLocalHost: true})` also accepts the
 *  hostname `localhost`. **/
export const ip = presetFormatBuilder<'ip', DEFAULT_IP_PARAMS, Override<IPParams>>('ip');
/** IPv4 (`IPv4`); `ipv4({allowPort: true})` accepts a trailing port. **/
export const ipv4 = presetFormatBuilder<'ip', DEFAULT_IPV4_PARAMS, Override<IPParams, 'version'>>('ip');
/** IPv6 (`IPv6`). **/
export const ipv6 = presetFormatBuilder<'ip', DEFAULT_IPV6_PARAMS, Override<IPParams, 'version'>>('ip');
/** IP (any) with port (`IPWithPort`). **/
export const ipWithPort = presetFormatBuilder<'ip', DEFAULT_IP_PORT_PARAMS, Override<IPParams, 'allowPort'>>('ip');
/** IPv4 with port (`IPv4WithPort`). **/
export const ipv4WithPort = presetFormatBuilder<'ip', DEFAULT_IPV4_PORT_PARAMS, Override<IPParams, 'version' | 'allowPort'>>(
  'ip'
);
/** IPv6 with port (`IPv6WithPort`). **/
export const ipv6WithPort = presetFormatBuilder<'ip', DEFAULT_IPV6_PORT_PARAMS, Override<IPParams, 'version' | 'allowPort'>>(
  'ip'
);

/** Any RFC 3986 URI, any scheme (`Uri`). **/
export const uri = presetFormatBuilder<'url', DEFAULT_URI_PARAMS, Override<UrlParams, 'pattern'>>('url');
/** URI reference, relative allowed (`UriReference`). **/
export const uriReference = presetFormatBuilder<'url', DEFAULT_URI_REFERENCE_PARAMS, Override<UrlParams, 'pattern'>>('url');
/** IRI — a URI with non-ASCII characters allowed (`Iri`). **/
export const iri = presetFormatBuilder<'url', DEFAULT_IRI_PARAMS, Override<UrlParams, 'pattern'>>('url');
/** IRI reference, relative allowed (`IriReference`). **/
export const iriReference = presetFormatBuilder<'url', DEFAULT_IRI_REFERENCE_PARAMS, Override<UrlParams, 'pattern'>>('url');
/** RFC 6570 URI template (`UriTemplate`). **/
export const uriTemplate = presetFormatBuilder<'url', DEFAULT_URI_TEMPLATE_PARAMS, Override<UrlParams, 'pattern'>>('url');
/** RFC 1123 host name, single label allowed (`Hostname`). **/
export const hostname = presetFormatBuilder<'domain', DEFAULT_HOSTNAME_PARAMS, Override<DomainParams, 'pattern'>>('domain');
/** Internationalized host name (`IdnHostname`). **/
export const idnHostname = presetFormatBuilder<'domain', DEFAULT_IDN_HOSTNAME_PARAMS, Override<DomainParams, 'pattern'>>(
  'domain'
);
/** RFC 3339 duration string (`StringDuration`). **/
export const stringDuration = presetFormatBuilder<
  'stringFormat',
  DEFAULT_STRING_DURATION_PARAMS,
  Override<StringParams, 'pattern'>
>('stringFormat');
/** A string that compiles as an ECMA-262 regular expression (`RegexString`). **/
export const regexString = presetFormatBuilder<'stringFormat', DEFAULT_REGEX_PARAMS, Override<StringParams, 'pattern'>>(
  'stringFormat'
);
/** RFC 6901 JSON pointer (`JsonPointer`). **/
export const jsonPointer = presetFormatBuilder<'stringFormat', DEFAULT_JSON_POINTER_PARAMS, Override<StringParams, 'pattern'>>(
  'stringFormat'
);
/** RFC 6901 relative JSON pointer (`RelativeJsonPointer`). **/
export const relativeJsonPointer = presetFormatBuilder<
  'stringFormat',
  DEFAULT_RELATIVE_JSON_POINTER_PARAMS,
  Override<StringParams, 'pattern'>
>('stringFormat');

/** Domain name (`Domain`); `domain({maxLength: 100})` overrides bounds, keeping
 *  the built-in pattern. **/
export const domain = presetFormatBuilder<'domain', DEFAULT_DOMAIN_PARAMS, Override<DomainParams>>('domain');
/** Unicode domain (`DomainUnicode`). **/
export const domainUnicode = presetFormatBuilder<'domain', DEFAULT_DOMAIN_UNICODE_PARAMS, Override<DomainParams, 'pattern'>>(
  'domain'
);
/** Punycode domain (`DomainPunycode`). **/
export const domainPunycode = presetFormatBuilder<'domain', DEFAULT_DOMAIN_PUNYCODE_PARAMS, Override<DomainParams, 'pattern'>>(
  'domain'
);
/** Domain checked label by label (`DomainParts`). **/
export const domainParts = presetFormatBuilder<
  'domain',
  DEFAULT_DOMAIN_PARTS_PARAMS,
  Override<DomainPartsParams, 'names' | 'tld'>
>('domain');

/** Email (`Email`); `email({maxLength: 100})` overrides bounds, keeping the
 *  built-in pattern. **/
export const email = presetFormatBuilder<'email', DEFAULT_EMAIL_PARAMS, Override<EmailParams>>('email');
/** Full RFC 5321 address (`EmailAddress`). **/
export const emailAddress = presetFormatBuilder<'email', DEFAULT_EMAIL_ADDRESS_PARAMS, Override<EmailParams, 'pattern'>>('email');
/** Internationalized address (`IdnEmail`). **/
export const idnEmail = presetFormatBuilder<'email', DEFAULT_IDN_EMAIL_PARAMS, Override<EmailParams, 'pattern'>>('email');
/** Punycode-domain email (`EmailPunycode`). **/
export const emailPunycode = presetFormatBuilder<'email', DEFAULT_EMAIL_PUNYCODE_PARAMS, Override<EmailParams, 'pattern'>>(
  'email'
);
/** Email checked part by part (`EmailParts`). **/
export const emailParts = presetFormatBuilder<
  'email',
  DEFAULT_EMAIL_PARTS_PARAMS,
  Override<EmailPartsParams, 'localPart' | 'domain'>
>('email');

/** URL string (`StringUrl`); `stringUrl({maxLength: 100})` overrides bounds, keeping the built-in
 *  pattern. **/
export const stringUrl = presetFormatBuilder<'url', DEFAULT_URL_PARAMS, Override<UrlParams>>('url');
/** HTTP(S) URL string (`StringUrlHttp`); `stringUrlHttp({maxLength: 100})` retunes the bound. **/
export const stringUrlHttp = presetFormatBuilder<'url', DEFAULT_URL_HTTP_PARAMS, Override<UrlParams, 'pattern'>>('url');
/** file:// URL string (`StringUrlFile`). **/
export const stringUrlFile = presetFormatBuilder<'url', DEFAULT_URL_FILE_PARAMS, Override<UrlParams, 'pattern'>>('url');

/** A URL object field (`Url`); `url({maxLength: 200})` checks its href. **/
export function url(id?: InjectRunTypeId<UrlInstance>): RunType<UrlInstance>;
export function url<const P extends UrlObjectParams>(
  formatParams: CompTimeArgs<ExactParams<P, UrlObjectParams>>,
  id?: InjectRunTypeId<Url<P>>
): RunType<Url<P>>;
export function url<const P extends UrlObjectParams, const B extends string>(
  formatParams: CompTimeArgs<ExactParams<P, UrlObjectParams>>,
  brandTag: BrandArg<B>,
  id?: InjectRunTypeId<Url<P, B>>
): RunType<Url<P, B>>;
export function url(
  formatParamsOrId?: UrlObjectParams | InjectRunTypeId<UrlInstance>,
  brandOrId?: BrandArg<string> | InjectRunTypeId<UrlInstance>,
  id?: InjectRunTypeId<UrlInstance>
): RunType<UrlInstance> {
  const formatParams = typeof formatParamsOrId === 'object' && !Array.isArray(formatParamsOrId) ? formatParamsOrId : {};
  return builderResult(lastInjectedId(formatParamsOrId, brandOrId, id), {type: 'nativeUrl', formatParams});
}

/** The call shape of the two URL object presets. **/
export interface UrlObjectPresetBuilder<Defaults extends object> {
  (id?: InjectRunTypeId<UrlObjectFormat<Defaults>>): RunType<UrlObjectFormat<Defaults>>;
  <const P extends Override<UrlObjectParams, 'pattern'>>(
    formatParams: CompTimeArgs<ExactParams<P, Override<UrlObjectParams, 'pattern'>>>,
    id?: InjectRunTypeId<UrlObjectFormat<FormatDefaults<Defaults, P>>>
  ): RunType<UrlObjectFormat<FormatDefaults<Defaults, P>>>;
}
/** HTTP(S) URL object (`UrlHttp`); `urlHttp({maxLength: 100})` retunes the bound. **/
export const urlHttp = presetFormatBuilder('nativeUrl') as unknown as UrlObjectPresetBuilder<DEFAULT_URL_HTTP_PARAMS>;
/** file:// URL object (`UrlFile`). **/
export const urlFile = presetFormatBuilder('nativeUrl') as unknown as UrlObjectPresetBuilder<DEFAULT_URL_FILE_PARAMS>;

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
