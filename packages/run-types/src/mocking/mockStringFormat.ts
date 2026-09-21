// Single mock entry point for every string format, registered once for ReflectionKind.string and dispatching on
// the format name. The value-transform (lowercase/trim) is applied by the mock walker AFTER this returns, so the
// functions here produce the base valid value.

import {registerMockingFunction} from './mockRegistry.ts';
import {nativeMockRandom} from './mockRandom.ts';
import type {MockRandom} from './mockRandom.ts';
import type {MockOptions} from './mockTypes.ts';
import {
  getCardNetworkRules,
  luhnCheckDigit,
  CARD_NETWORKS,
  type CardNetwork,
  type CreditCardParams,
} from '../formats/string/credit-card-pure-fns.ts';
import {RunTypeKind} from '../go-generated/runTypeKind.generated.ts';
import type {FormatAnnotation} from '../runtypes/formatAnnotation.ts';
import type {
  DomainParams,
  EmailParams,
  IPParams,
  UUIDParams,
  UrlParams,
  PatternParam,
  Samples,
  StringParams,
} from '../formats/string/stringFormats.ts';
import type {DateParams, DateTimeParams, TimeParams} from '../formats/datetime/stringDateTimeFormats.ts';
import {mockBoundedDate, mockBoundedTime, mockBoundedDateTime} from './mockDateTimeBounds.ts';

// Returns undefined for an unrecognised name so the walker falls back to the kind-default (a plain random string).
// `random` defaults to the shared native instance so a call without one still works.
function mockStringFormat(annotation: FormatAnnotation, random: MockRandom = nativeMockRandom, options?: MockOptions): unknown {
  const params = annotation.params ?? {};
  switch (annotation.name) {
    case 'stringFormat':
      return mockStringParams(params as StringParams, random);
    case 'uuid':
      return mockUuid(params as Partial<UUIDParams>, random);
    case 'creditCard':
      return mockCreditCard(params as CreditCardParams, random, options);
    case 'date': {
      const dateParams = params as Partial<DateParams>;
      return mockBoundedDate(dateParams.format ?? 'ISO', dateParams, random);
    }
    case 'time': {
      const timeParams = params as Partial<TimeParams>;
      return mockBoundedTime(timeParams.format ?? 'ISO', timeParams, random);
    }
    case 'dateTime':
      return mockBoundedDateTime(params as Partial<DateTimeParams>, random);
    case 'ip':
      return mockIp(params as Partial<IPParams>, random);
    case 'domain':
      return lengthFiltered(params, () => mockDomain(params as DomainParams, random));
    case 'email':
      return lengthFiltered(params, () => mockEmail(params as EmailParams, random));
    case 'url':
      return lengthFiltered(params, () => mockUrl(params as UrlParams, random));
    default:
      return undefined;
  }
}

registerMockingFunction(RunTypeKind.string, mockStringFormat);

// ─────────────────────────── StringFormat ───────────────────────────

function mockStringParams(params: StringParams, random: MockRandom): string {
  if (params.allowedValues) return pickSample(params.allowedValues.val, random) ?? '';
  // A regex can't be reversed, so draw from the supplied samples, keeping only those satisfying the length bounds
  // (e.g. Alpha<{maxLength:3}> must not pick a 5-char sample).
  const sample = pickSample(
    filterSamplesByLength(
      params.mockSamples ?? patternSampleList(params.pattern) ?? toSampleList(params.disallowedValues?.mockSamples),
      params
    ),
    random
  );
  if (sample !== undefined) return sample;
  // `contentMediaType` needs a floor: a random string is not JSON, and a mock must satisfy its own validator.
  // The shipped JsonContent aliases carry a sample pool, so only a hand-written `String<{contentMediaType: …}>`
  // reaches here, and the emptiest valid document is the answer.
  if (params.contentMediaType === 'application/json') {
    return params.contentEncoding === 'base64' ? 'e30=' : '{}';
  }
  const charSet = params.allowedChars?.val ?? asCharString(params.disallowedChars?.mockSamples);
  if (charSet) return randomStringFrom(charSet, Math.max(1, pickMockLength(params, random)), random);
  if (params.pattern !== undefined) {
    throw new Error(
      'StringFormat: a `pattern` needs `mockSamples` compatible with the length bounds to mock — ' +
        'none survived (every sample violates length/minLength/maxLength), or none exist. The build ' +
        'auto-generates them from the regex; building without the plugin/CLI (or with patternSampleCount 0) ' +
        'requires declaring mockSamples explicitly.'
    );
  }
  return randomString(pickMockLength(params, random), random);
}

// patternSampleList returns a pattern's `mockSamples` as a string[]: the Go scanner emits an array even when the
// source literal was a single char-set string.
function patternSampleList(pattern: PatternParam | undefined): readonly string[] | undefined {
  const samples = (pattern as {mockSamples?: Samples} | undefined)?.mockSamples;
  return toSampleList(samples);
}

// filterSamplesByLength drops samples violating length / minLength / maxLength.
// When EVERY sample violates them the result is EMPTY, never the unfiltered list: an out-of-bounds sample would
// fail the format's own validator, so the caller falls through to a bounded synthesizer or throws instead.
function filterSamplesByLength(samples: readonly string[] | undefined, params: StringParams): readonly string[] | undefined {
  if (!samples || samples.length === 0) return samples;
  if (params.length === undefined && params.minLength === undefined && params.maxLength === undefined) return samples;
  return samples.filter((sample) => {
    if (params.length !== undefined && sample.length !== params.length) return false;
    if (params.minLength !== undefined && sample.length < params.minLength) return false;
    if (params.maxLength !== undefined && sample.length > params.maxLength) return false;
    return true;
  });
}

// pickSample returns a random entry from a non-empty list, else undefined.
export function pickSample(samples: readonly string[] | undefined, random: MockRandom): string | undefined {
  if (!samples || samples.length === 0) return undefined;
  return samples[random.int(0, samples.length - 1)];
}

function toSampleList(samples: Samples | undefined): readonly string[] | undefined {
  if (samples === undefined) return undefined;
  return typeof samples === 'string' ? [samples] : samples;
}

function asCharString(samples: Samples | undefined): string | undefined {
  return typeof samples === 'string' ? samples : undefined;
}

function randomStringFrom(chars: string, length: number, random: MockRandom): string {
  if (chars.length === 0) return '';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[random.int(0, chars.length - 1)];
  return out;
}

function pickMockLength(params: StringParams, random: MockRandom): number {
  if (params.length !== undefined) return params.length;
  if (params.maxLength !== undefined && params.minLength !== undefined) {
    return random.int(params.minLength, params.maxLength);
  }
  if (params.maxLength !== undefined) return random.int(0, params.maxLength);
  if (params.minLength !== undefined) return random.int(params.minLength, params.minLength + 8);
  return random.int(1, 16);
}

const MOCK_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function randomString(length: number, random: MockRandom): string {
  let out = '';
  for (let i = 0; i < length; i++) out += MOCK_CHARS[random.int(0, MOCK_CHARS.length - 1)];
  return out;
}

// ─────────────────────────────── UUID ───────────────────────────────

// A mock only has to produce ONE value the validator accepts, and every v4 UUID is a valid `'any'` UUID, so the
// generator narrows to v4 where the validator stays open: the safe direction, since mock ⊆ valid.
// Only `'7'` needs its own generator, because a v4 would fail a v7-pinned check.
function mockUuid(params: Partial<UUIDParams>, random: MockRandom): string {
  return params.version === '7' ? random.uuidV7() : random.uuidV4();
}

// ─────────────────────────── Credit card ────────────────────────────

// A card number can be BUILT, unlike a pattern-backed format whose regex cannot be reversed, so the default is a
// freshly generated number that is different every run and passes the exact validator the format emitted.
// The network table and the checksum come from the format's own module, so a mock cannot drift into generating
// cards its own format rejects.

// The published gateway sandbox numbers, behind the `testCreditCards` mock option: a gateway sandbox accepts
// nothing else, and everything else is better served by a generated value.
const TEST_CARD_NUMBERS: Record<CardNetwork, readonly string[]> = {
  visa: ['4111111111111111', '4012888888881881', '4222222222222'],
  mastercard: ['5555555555554444', '5105105105105100', '2223003122003222'],
  amex: ['378282246310005', '371449635398431', '378734493671000'],
  discover: ['6011111111111117', '6011000990139424'],
  jcb: ['3530111333300000', '3566002020360505'],
  diners: ['30569309025904', '38520000023237'],
  unionpay: ['6200000000000005'],
  maestro: ['6759649826438453', '6304000000000000'],
};

function generateCardNumber(network: CardNetwork, random: MockRandom): string {
  const rule = getCardNetworkRules()[network];
  const [low, high] = rule.prefixes[random.int(0, rule.prefixes.length - 1)];
  const prefix = String(random.int(Number(low), Number(high))).padStart(low.length, '0');
  const length = rule.lengths[random.int(0, rule.lengths.length - 1)];
  let body = prefix.slice(0, length - 1);
  while (body.length < length - 1) body += String(random.int(0, 9));
  return body + luhnCheckDigit(body);
}

// Always plain digits: a number with no separator is valid whether or not the format declares any.
function mockCreditCard(params: CreditCardParams, random: MockRandom, options?: MockOptions): string {
  // Pinning no network still generates for a real one: a made-up prefix is a number no issuer could have handed out.
  const networks = params.networks?.length ? params.networks : CARD_NETWORKS;
  const network = networks[random.int(0, networks.length - 1)];
  if (options?.testCreditCards) {
    const pool = TEST_CARD_NUMBERS[network];
    return pool[random.int(0, pool.length - 1)];
  }
  return generateCardNumber(network, random);
}

// negativeForStringFormat is the wrong value for a string format with a more interesting failure than "not a
// string"; undefined for every format without one, so the caller falls back to the generic inverse.
// For a card number that means a real number with ONE digit changed, which always breaks the Luhn sum, since
// `123` only exercises the base string check.
export function negativeForStringFormat(annotation: FormatAnnotation | undefined, value: unknown): unknown {
  if (annotation?.name !== 'creditCard' || typeof value !== 'string') return undefined;
  for (let i = value.length - 1; i >= 0; i--) {
    const charCode = value.charCodeAt(i);
    if (charCode < 48 || charCode > 57) continue;
    return value.slice(0, i) + String((charCode - 48 + 1) % 10) + value.slice(i + 1);
  }
  return 'not-a-card';
}

// Date / Time / DateTime mocking lives in ./mockDateTimeBounds.ts: honoring the min/max bounds (absolute or
// relative now±P) so the mock re-passes validate requires mirroring the validator's per-kind key scale.

// ──────────────────────────────── IP ────────────────────────────────

function mockIp(params: Partial<IPParams>, random: MockRandom): string {
  if (params.version === 4) return mockIpV4(params, random);
  if (params.version === 6) return mockIpV6(params, random);
  return random.float() > 0.5 ? mockIpV4(params, random) : mockIpV6(params, random);
}

function mockIpV4(params: Partial<IPParams>, random: MockRandom): string {
  // The hostname is not an address, so a format that has not opted in must never see it in its mock pool.
  // It stays valid with a port: the allowPort parser splits the port off first.
  if (params.allowLocalHost && random.float() > 0.8) {
    return params.allowPort ? `localhost:${randomPort(random)}` : 'localhost';
  }
  const address = Array.from({length: 4}, () => random.int(0, 255)).join('.');
  return params.allowPort ? `${address}:${randomPort(random)}` : address;
}

function mockIpV6(params: Partial<IPParams>, random: MockRandom): string {
  // The loopback ADDRESS needs no opt-in (allowLocalHost covers the hostname spelling only).
  if (random.float() > 0.8) {
    const loopback = random.float() > 0.5 ? '0:0:0:0:0:0:0:1' : '::1';
    // The allowPort v6 parser requires the bracketed `[addr]` form; a bare address fails to match.
    return params.allowPort ? `[${loopback}]` : loopback;
  }
  // `Math.floor(x * 0xffff)` (0..0xfffe) kept via float(): `int(0, 0xffff)` would widen the range and change output.
  const address = Array.from({length: 8}, () => Math.floor(random.float() * 0xffff).toString(16)).join(':');
  return params.allowPort ? `[${address}]:${randomPort(random)}` : address;
}

// randomPort serves the *WithPort IP formats.
function randomPort(random: MockRandom): number {
  return random.int(0, 65535);
}

// ─────────────────────────── Domain / Email ─────────────────────────

function mockDomain(params: DomainParams, random: MockRandom): string {
  // allowedValues wins outright: the emitted validator accepts only these exact domains, as in mockStringParams.
  if (params.allowedValues) {
    const allowed = pickSample(params.allowedValues.val, random);
    if (allowed !== undefined) return allowed;
  }
  // names/tld decomposition (DomainStrict): the samples live under `<part>.pattern.mockSamples`, or a bare mockSamples.
  if (params.names || params.tld) {
    const name = pickSample(domainPartSamples(params.names), random) ?? 'example';
    const tld = pickSample(domainPartSamples(params.tld), random) ?? 'com';
    return `${name}.${tld}`;
  }
  return pickSample(params.mockSamples ?? patternSampleList(asPattern(params.pattern)), random) ?? 'example.com';
}

// domainPartSamples prefers a names/tld sub-format's own `mockSamples` over its `pattern.mockSamples`.
function domainPartSamples(part: {mockSamples?: Samples; pattern?: unknown} | undefined): readonly string[] | undefined {
  if (!part) return undefined;
  return toSampleList(part.mockSamples) ?? patternSampleList(asPattern(part.pattern));
}

// Named-family draws come from pattern sample pools predating any schema-sibling length bounds (the JSON Schema
// door REPLACES the brand's default bounds with the document's), so filter the draw so validate(mock()) holds.
// Bounds no pool entry satisfies are an authoring problem to surface, hence the loud exhaustion after the budget.
function lengthFiltered(params: object, draw: () => string): string {
  const {minLength, maxLength} = params as {minLength?: number; maxLength?: number};
  if (minLength === undefined && maxLength === undefined) return draw();
  for (let attempt = 0; attempt < 32; attempt++) {
    const candidate = draw();
    // Code points, matching the emitted validator's bounds: an astral character must not be filtered out over a
    // `.length` the validator never looks at.
    const size = [...candidate].length;
    if ((minLength === undefined || size >= minLength) && (maxLength === undefined || size <= maxLength)) {
      return candidate;
    }
  }
  throw new Error(
    'Cannot mock format: no sample satisfied the minLength/maxLength bounds after 32 attempts — widen the bounds or provide mockSamples that fit.'
  );
}

function mockEmail(params: EmailParams, random: MockRandom): string {
  if (params.localPart || params.domain) {
    const local = params.localPart ? mockStringParams(params.localPart, random) : 'user';
    const domain = params.domain ? mockDomain(params.domain, random) : 'example.com';
    return `${local}@${domain}`;
  }
  return pickSample(params.mockSamples ?? patternSampleList(asPattern(params.pattern)), random) ?? 'john@example.com';
}

// ──────────────────────────────── URL ───────────────────────────────

function mockUrl(params: UrlParams, random: MockRandom): string {
  // URL formats bake their scheme set into the pattern, which can't be reversed, so draw from its mockSamples.
  // The default only fits the generic URL.
  return pickSample(params.mockSamples ?? patternSampleList(asPattern(params.pattern)), random) ?? 'https://example.com';
}

// asPattern coerces a domain/email/url `pattern` param (`{source, flags}` or `{val: RegExp}`) to PatternParam:
// only the `mockSamples` field matters for mocking.
function asPattern(pattern: unknown): PatternParam | undefined {
  return pattern as PatternParam | undefined;
}
