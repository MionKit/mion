// Single mock entry point for every string format. Registered once for
// ReflectionKind.string via `registerMockingFunction`; the mock walker
// calls it with the FormatAnnotation and the generation's shared MockRandom,
// and dispatches on the format name. Replaces the old per-format `_mock`
// classes (the project's class→switch convention). The value-transform
// (lowercase/trim) is applied by the mock walker AFTER this returns, so these
// produce the base valid value.

import {registerMockingFunction} from './mockRegistry.ts';
import {nativeMockRandom} from './mockRandom.ts';
import type {MockRandom} from './mockRandom.ts';
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

// mockStringFormat dispatches on the format name. Returns undefined for
// an unrecognised name so the mock walker falls back to the kind-default
// (a plain random string). `random` defaults to the shared native instance so
// a call without one (a custom caller) still works.
function mockStringFormat(annotation: FormatAnnotation, random: MockRandom = nativeMockRandom): unknown {
  const params = annotation.params ?? {};
  switch (annotation.name) {
    case 'stringFormat':
      return mockStringParams(params as StringParams, random);
    case 'uuid':
      return mockUuid(params as Partial<UUIDParams>, random);
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
  // Pattern / disallowed-value samples can't be reversed from a regex, so
  // we draw from the supplied samples. When length bounds are present, keep
  // only the samples that satisfy them (the pattern formats encode their
  // mockSamples as a char-set string and length-bound that; the ts-go port
  // keeps array samples + filters by length — e.g. Alpha<{maxLength:3}>
  // must not pick a 5-char sample).
  const sample = pickSample(
    filterSamplesByLength(
      params.mockSamples ?? patternSampleList(params.pattern) ?? toSampleList(params.disallowedValues?.mockSamples),
      params
    ),
    random
  );
  if (sample !== undefined) return sample;
  // `contentMediaType` needs a floor: a random string is not JSON, and a mock
  // must satisfy its own validator. The shipped JsonContent aliases carry a
  // sample pool, so this only catches a hand-written
  // `String<{contentMediaType: 'application/json'}>` — for which the emptiest
  // valid document is the honest answer.
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

// patternSampleList returns a pattern's `mockSamples` as a string[] (the
// Go scanner emits them as an array even when the source literal was a
// single char-set string), or undefined when the pattern carries none.
function patternSampleList(pattern: PatternParam | undefined): readonly string[] | undefined {
  const samples = (pattern as {mockSamples?: Samples} | undefined)?.mockSamples;
  return toSampleList(samples);
}

// filterSamplesByLength drops samples that violate the length bounds
// (length / minLength / maxLength). Returns the original list when no
// bound applies. When EVERY sample violates the bounds the result is
// EMPTY — never the unfiltered list: an out-of-bounds sample would fail
// the format's own validator (`validate(mock())` must hold), so the
// caller falls through to its bounded synthesizers or throws a clear
// error instead of silently emitting an invalid mock.
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

// The version-agnostic `'any'` never leaves the generator guessing: a mock only
// has to produce ONE value the validator accepts, and every v4 UUID is a valid
// `'any'` UUID. So the generator narrows (always v4) exactly where the validator
// stays open (any RFC 9562 layout) — the safe direction, since mock ⊆ valid.
// Only `'7'` needs its own generator, because a v4 would fail a v4-pinned check.
function mockUuid(params: Partial<UUIDParams>, random: MockRandom): string {
  return params.version === '7' ? random.uuidV7() : random.uuidV4();
}

// Date / Time / DateTime mocking lives in ./mockDateTimeBounds.ts — it must
// honor the min/max bounds (absolute or relative now±P) so the mock re-passes
// validate, which requires mirroring the validator's per-kind key scale.

// ──────────────────────────────── IP ────────────────────────────────

function mockIp(params: Partial<IPParams>, random: MockRandom): string {
  if (params.version === 4) return mockIpV4(params, random);
  if (params.version === 6) return mockIpV6(params, random);
  return random.float() > 0.5 ? mockIpV4(params, random) : mockIpV6(params, random);
}

function mockIpV4(params: Partial<IPParams>, random: MockRandom): string {
  // Only reachable with allowLocalHost — the hostname is not an address, so a
  // format that has not opted in must never see it in its mock pool. It stays
  // valid with a port: the allowPort parser splits the port off first.
  if (params.allowLocalHost && random.float() > 0.8) {
    return params.allowPort ? `localhost:${randomPort(random)}` : 'localhost';
  }
  const address = Array.from({length: 4}, () => random.int(0, 255)).join('.');
  return params.allowPort ? `${address}:${randomPort(random)}` : address;
}

function mockIpV6(params: Partial<IPParams>, random: MockRandom): string {
  // The loopback ADDRESS needs no opt-in (allowLocalHost covers the hostname
  // spelling only), so it stays in the pool for every v6 format.
  if (random.float() > 0.8) {
    const loopback = random.float() > 0.5 ? '0:0:0:0:0:0:0:1' : '::1';
    // The allowPort v6 parser requires the bracketed `[addr]` (optionally
    // `[addr]:port`) form — a bare address fails to match.
    return params.allowPort ? `[${loopback}]` : loopback;
  }
  // `Math.floor(x * 0xffff)` (0..0xfffe), preserved exactly via float() — an
  // `int(0, 0xffff)` would widen the range by one and change no-seed output.
  const address = Array.from({length: 8}, () => Math.floor(random.float() * 0xffff).toString(16)).join(':');
  return params.allowPort ? `[${address}]:${randomPort(random)}` : address;
}

// randomPort returns a valid 0-65535 port for the *WithPort IP formats.
function randomPort(random: MockRandom): number {
  return random.int(0, 65535);
}

// ─────────────────────────── Domain / Email ─────────────────────────

function mockDomain(params: DomainParams, random: MockRandom): string {
  // allowedValues wins outright: the emitted validator only accepts these
  // exact domains, so any synthesized value would fail its own validate.
  // Mirrors the plain string-format path (mockStringParams).
  if (params.allowedValues) {
    const allowed = pickSample(params.allowedValues.val, random);
    if (allowed !== undefined) return allowed;
  }
  // names/tld decomposition (DomainStrict): draw a label + tld from
  // their sub-pattern samples (we use the names/tld char-sets). The
  // samples live under `<part>.pattern.mockSamples` (or a bare mockSamples).
  if (params.names || params.tld) {
    const name = pickSample(domainPartSamples(params.names), random) ?? 'example';
    const tld = pickSample(domainPartSamples(params.tld), random) ?? 'com';
    return `${name}.${tld}`;
  }
  return pickSample(params.mockSamples ?? patternSampleList(asPattern(params.pattern)), random) ?? 'example.com';
}

// domainPartSamples reads a names/tld sub-format's samples, preferring its
// own `mockSamples` and falling back to its `pattern.mockSamples`.
function domainPartSamples(part: {mockSamples?: Samples; pattern?: unknown} | undefined): readonly string[] | undefined {
  if (!part) return undefined;
  return toSampleList(part.mockSamples) ?? patternSampleList(asPattern(part.pattern));
}

// Named-family draws come from pattern sample pools that predate any
// schema-sibling length bounds (the JSON Schema door REPLACES the brand's
// default bounds with the document's) — filter the draw against params
// minLength / maxLength so validate(mock()) holds. Bounds no pool entry
// satisfies are an authoring problem the mock must surface, not paper
// over: loud exhaustion after the standard attempt budget.
function lengthFiltered(params: object, draw: () => string): string {
  const {minLength, maxLength} = params as {minLength?: number; maxLength?: number};
  if (minLength === undefined && maxLength === undefined) return draw();
  for (let attempt = 0; attempt < 32; attempt++) {
    const candidate = draw();
    if (
      (minLength === undefined || candidate.length >= minLength) &&
      (maxLength === undefined || candidate.length <= maxLength)
    ) {
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
  // URL formats bake their scheme set into the pattern, which can't be
  // reversed — draw from the pattern's mockSamples (http(s)/ftp/ws,
  // http-only, or file:// per variant). Default only fits the generic URL.
  return pickSample(params.mockSamples ?? patternSampleList(asPattern(params.pattern)), random) ?? 'https://example.com';
}

// asPattern coerces a domain/email/url `pattern` param (a `{source, flags}`
// or `{val: RegExp}` union) to the PatternParam shape patternSampleList
// reads — only the `mockSamples` field matters for mocking.
function asPattern(pattern: unknown): PatternParam | undefined {
  return pattern as PatternParam | undefined;
}
