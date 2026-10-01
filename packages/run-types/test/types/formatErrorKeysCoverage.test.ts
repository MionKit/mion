// Compile-time gate for the generated FriendlyText error keys: every format the Go registry generates must be
// mapped to its params type here, and every one of its params must be sampled (or excluded with a reason) in
// ts-go-runtypes/internal/cachegen/typefunctions/formats/errorkeys_samples.go. A new format or a new param fails
// `pnpm run typecheck` until then. Type-only bodies, referenced by `test` so lint leaves them.

import {expect, test} from 'vitest';
import type {FormatSampledParams} from '../../src/go-generated/formatErrorKeys.generated.ts';
import type {FormatName} from '../../src/go-generated/typeFormats.generated.ts';
import type {NumberParams} from '../../src/formats/numberFormats.ts';
import type {BigIntParams} from '../../src/formats/bigintFormats.ts';
import type {
  DomainParams,
  EmailParams,
  IPParams,
  StringParams,
  UrlParams,
  UUIDParams,
} from '../../src/formats/string/stringFormats.ts';
import type {CreditCardParams} from '../../src/formats/string/credit-card-pure-fns.ts';
import type {DateParams, DateTimeParams, TimeParams} from '../../src/formats/datetime/stringDateTimeFormats.ts';
import type {NativeDateParams} from '../../src/formats/datetime/dateFormats.ts';
import type {TemporalFormatParamsByName} from '../../src/formats/datetime/temporalFormats.ts';
import type {FormattedCollectionParams, FormattedObjectParams} from '../../src/formats/structural.ts';

// A new format in the Go registry is a missing key here: add its params type.
type ParamsByFormat = Exhaustive<{
  numberFormat: NumberParams;
  bigintFormat: BigIntParams;
  stringFormat: StringParams;
  url: UrlParams;
  uuid: UUIDParams;
  ip: IPParams;
  creditCard: CreditCardParams;
  email: EmailParams;
  domain: DomainParams;
  date: DateParams;
  time: TimeParams;
  dateTime: DateTimeParams;
  nativeDate: NativeDateParams;
  temporalInstant: TemporalFormatParamsByName['temporalInstant'];
  temporalZonedDateTime: TemporalFormatParamsByName['temporalZonedDateTime'];
  temporalPlainDate: TemporalFormatParamsByName['temporalPlainDate'];
  temporalPlainTime: TemporalFormatParamsByName['temporalPlainTime'];
  temporalPlainDateTime: TemporalFormatParamsByName['temporalPlainDateTime'];
  temporalPlainYearMonth: TemporalFormatParamsByName['temporalPlainYearMonth'];
  formattedArray: FormattedCollectionParams;
  formattedSet: FormattedCollectionParams;
  formattedMap: FormattedCollectionParams;
  formattedObject: FormattedObjectParams;
}>;
type Exhaustive<Map extends Record<FormatName, object>> = Map;

// A new param is listed here under its format: sample it, or exclude it with a reason, then regenerate.
type Unsampled = {[Name in FormatName]: Exclude<keyof ParamsByFormat[Name] & string, FormatSampledParams[Name]>};
const everyParamSampled: {[Name in FormatName]: never} = null as unknown as Unsampled;

test('every format param has an error-key sample (checked by tsc)', () => {
  expect(everyParamSampled).toBeNull();
});
