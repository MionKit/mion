// Public entry for the `@mionjs/run-types/formats` subpath: the format TYPE aliases plus the pure-fn
// registrations. Formats are JS-only types; validation / serialization / coercion are emitted on the Go
// side, keyed off the format name carried in the wire-protocol FormatAnnotation. The side-effect imports
// below MUST evaluate before any format module reaching a pure fn at runtime: emitted code looks one up
// by HASH and an absent key answers undefined, so a format check would silently accept everything.
import './string/string-formats-pure-fns.ts';
// Split out of the string pure fns: the card format carries more machinery than the rest of the family.
import './string/credit-card-pure-fns.ts';
import './datetime/dateTime-pure-fns.ts';
// The per-kind mock fns are NOT imported here: createMockData.ts registers them, so only a bundle
// that mocks carries them.

// Kept as `export type *`: the suite exporters' FORMATS_MODULE overlay keys off these lines.
export type * from './string/stringFormats.ts';
// The credit-card type, params and builder live beside the pure fns that back them.
export type * from './string/credit-card-pure-fns.ts';
export type * from './datetime/dateTimeParams.ts';
export type * from './datetime/stringDateTimeFormats.ts';
export type * from './datetime/dateFormats.ts';
export type * from './numberFormats.ts';
export type * from './bigintFormats.ts';
export type * from './refineFormat.ts';
// The named brand carriers, on the subpath the emitted declarations reference; see the note on
// their declaration in ../runtypes/typeFormat.ts.
export type {FormatBrand, NominalBrand} from '../runtypes/typeFormat.ts';
// The type-first spelling of the collection keywords; the value-first spelling is the trailing
// params bag on `RT.array` / `RT.object` / `RT.record` / `RT.set` / `RT.map`.
export type {
  FormattedArray,
  FormattedObject,
  FormattedSet,
  FormattedMap,
  FormattedCollectionParams,
  FormattedMapParams,
  FormattedObjectParams,
  FormattedCollectionParamsValueFirst,
  FormattedMapParamsValueFirst,
  FormattedObjectParamsValueFirst,
  StructuralBrand,
  // Deprecated: the pre-rename spellings of the collection bag, kept for one release.
  FormattedArrayParams,
  FormattedArrayParamsValueFirst,
} from './structural.ts';

// Temporal builders are NOT re-exported here: they live on the `@mionjs/run-types/formats/temporal`
// subpath, so non-Temporal consumers never pull in the Temporal lib.
export {string, number, currency, bigInt, date, brand} from './scalars.ts';
export {
  alpha,
  alphaNumeric,
  numeric,
  base64,
  base32,
  base16,
  jsonContent,
  jsonContentBase64,
  lowercase,
  uppercase,
  capitalize,
  transform,
  uuid,
  uuidv4,
  uuidv7,
  ip,
  ipv4,
  ipv6,
  ipWithPort,
  ipv4WithPort,
  ipv6WithPort,
  uri,
  uriReference,
  iri,
  iriReference,
  uriTemplate,
  hostname,
  idnHostname,
  stringDuration,
  regexString,
  jsonPointer,
  relativeJsonPointer,
  domain,
  domainUnicode,
  domainPunycode,
  domainStrict,
  email,
  emailAddress,
  idnEmail,
  emailPunycode,
  emailStrict,
  url,
  urlHttp,
  urlFile,
  stringDate,
  stringTime,
  stringDateTime,
} from './string/stringFormats.ts';
export {creditCard, CARD_NETWORKS} from './string/credit-card-pure-fns.ts';
export {
  integer,
  float,
  positive,
  negative,
  positiveInt,
  negativeInt,
  int8,
  int16,
  int32,
  uint8,
  uint16,
  uint32,
} from './numberFormats.ts';
export {bigPositive, bigNegative, bigPositiveInt, bigNegativeInt, bigInt64, bigUInt64} from './bigintFormats.ts';
