// Public entry for the `ts-runtypes/formats` subpath — the
// string-format type catalog plus the runtime registrations every format
// relies on. Formats are JS-only TYPE aliases; validation / serialization /
// coercion are emitted on the Go side, keyed off the format name carried in
// the wire-protocol FormatAnnotation. The runtime here only carries the
// per-kind mock switch and the pure-fn / pattern registrations.
//
// Pure-fn registration MUST evaluate before any format module that reaches a
// pure fn at runtime — the Go-emitted cache wires
// `utl.getPureFn('rtFormats::isUUID')` and friends, which the registry
// must already hold. Importing this for its side effect first keeps the
// ordering robust regardless of bundler tree-shaking.
import './string/string-formats-pure-fns.ts';
// Side-effect: registers the date / time pure fns (moved out of the
// string pure-fns file) plus the bound-comparison + relative-now fns.
import './datetime/dateTime-pure-fns.ts';
// Side-effect: registers the single string-format mock fn (mockStringFormat)
// with the runtime mock registry.
import '../mocking/mockStringFormat.ts';
// Side-effect: registers the number / bigint format mock fns for
// ReflectionKind.number / .bigint (constraint-respecting mock values).
import '../mocking/mockNumberFormat.ts';
import '../mocking/mockBigIntFormat.ts';
// Side-effect: registerFormatPattern validates each built-in pattern's
// mockSamples against its regex at load.
import './string/string-patterns.ts';

// Re-export the full TYPE surface of every format family. (Kept as `export type *`
// — the suite exporters' FORMATS_MODULE overlay keys off these lines.)
export type * from './string/stringFormats.ts';
export type * from './datetime/dateTimeParams.ts';
export type * from './datetime/stringDateTimeFormats.ts';
export type * from './datetime/dateFormats.ts';
export type * from './numberFormats.ts';
export type * from './bigintFormats.ts';

// Re-export the value-first BUILDER surface — the scalar leaves (`TF.string()` /
// `TF.number()` / `TF.bigInt()` / `TF.date()`), the `brand` nominal tag, and one
// builder per predefined format. (Temporal builders live on the dedicated
// `ts-runtypes/formats/temporal` subpath, NOT re-exported here, so non-Temporal
// consumers never pull in the Temporal lib.)
export {string, number, currency, bigInt, date, brand} from './scalars.ts';
export {not} from './not.ts';
export type {Not, NotableFormat, ValidNotOperand} from './not.ts';
export {
  alpha,
  alphaNumeric,
  numeric,
  lowercase,
  uppercase,
  capitalize,
  uuid,
  uuidv4,
  uuidv7,
  ip,
  ipv4,
  ipv6,
  ipWithPort,
  ipv4WithPort,
  ipv6WithPort,
  domain,
  domainUnicode,
  domainPunycode,
  domainStrict,
  email,
  emailPunycode,
  emailStrict,
  url,
  urlHttp,
  urlFile,
  stringDate,
  stringTime,
  stringDateTime,
} from './string/stringFormats.ts';
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
