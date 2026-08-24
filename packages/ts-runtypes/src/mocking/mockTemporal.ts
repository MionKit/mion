// Mock builders for the 8 builtin Temporal types. Each produces a random
// VALID instance of its type so the mock walker's output re-passes validate
// (which is just `v instanceof Temporal.X`). Dispatched from mockType.ts's
// KindClass arm keyed on the Temporal SubKinds.
//
// When the type carries a FormatTemporalX<{min,max,gt,lt}> brand, the mock
// MUST also satisfy those bounds (the emitter validates them with
// `Temporal.X.compare(v, bound)`). The orderable types (Instant,
// ZonedDateTime, PlainDate, PlainTime, PlainDateTime, PlainYearMonth) carry
// a `BoundAdapter` that maps an instance to/from a single comparable key —
// nanoseconds since the epoch for the instant-like types, a month index for
// PlainYearMonth — so the bound set collapses to one [lo, hi] key range, a
// random key is drawn in range, and the instance rebuilt. `gt`/`lt` are the
// exclusive twins of `min`/`max`: their edge is nudged inward by one grid
// step (1 ns, or one day for the date-only PlainDate, or one month for
// PlainYearMonth) so the generated value is strictly past the bound.
// PlainMonthDay and Duration have no ordering (no FormatTemporalX), so they
// ignore bounds.
//
// `Temporal` is read off globalThis at call time (native on Node 26+, the
// polyfill in tests) — never imported, so production bundles don't pull a
// polyfill. A guarded accessor gives a clear error if Temporal is absent.
//
// v1 keeps mocks in the ISO calendar + UTC time zone (the common case);
// calendar/time-zone variety is out of scope (documented in the spec).

import {RunTypeSubKind} from '../go-generated/runTypeKind.generated.ts';
import type {MockRandom} from './mockRandom.ts';

// Minimal structural views of the global Temporal namespace — just the
// constructors + statics the builders call. Avoids a hard dependency on the
// Temporal lib types (which the repo's tsconfig lib predates).

// A Temporal instance that can be offset by a Duration (every orderable
// type supports add/subtract) — used to evaluate relative `now±P` bounds.
interface Shiftable {
  add(duration: unknown): unknown;
  subtract(duration: unknown): unknown;
}

interface TemporalLike {
  PlainDate: {from(s: string): unknown};
  PlainTime: {from(s: string): unknown};
  PlainDateTime: {from(s: string): unknown};
  PlainYearMonth: {from(s: string | {year: number; month: number}): unknown};
  PlainMonthDay: {from(s: string): unknown};
  ZonedDateTime: {from(s: string): unknown};
  Instant: {fromEpochMilliseconds(ms: number): unknown; fromEpochNanoseconds(ns: bigint): unknown; from(s: string): unknown};
  Duration: {from(s: string): unknown};
  Now: {
    instant(): unknown;
    zonedDateTimeISO(): unknown;
    plainDateISO(): unknown;
    plainTimeISO(): unknown;
    plainDateTimeISO(): unknown;
  };
}

function temporal(): TemporalLike {
  const t = (globalThis as unknown as {Temporal?: TemporalLike}).Temporal;
  if (!t) {
    throw new Error(
      '[ts-runtypes] Temporal is not available in this runtime. ' +
        'Temporal ships natively in Node 26+ / modern browsers; on older runtimes install a polyfill ' +
        "(e.g. `globalThis.Temporal = require('temporal-polyfill').Temporal`)."
    );
  }
  return t;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

// Random calendar parts in safe ranges (day ≤ 28 to avoid month-length edge
// cases — every month has 28 days).
function randomDateParts(random: MockRandom): {year: number; month: number; day: number} {
  return {year: random.int(1970, 2099), month: random.int(1, 12), day: random.int(1, 28)};
}
function randomTimeParts(random: MockRandom): {hour: number; minute: number; second: number} {
  return {hour: random.int(0, 23), minute: random.int(0, 59), second: random.int(0, 59)};
}

function mockPlainDate(random: MockRandom): unknown {
  const d = randomDateParts(random);
  return temporal().PlainDate.from(`${pad(d.year, 4)}-${pad(d.month)}-${pad(d.day)}`);
}
function mockPlainTime(random: MockRandom): unknown {
  const tm = randomTimeParts(random);
  return temporal().PlainTime.from(`${pad(tm.hour)}:${pad(tm.minute)}:${pad(tm.second)}`);
}
function mockPlainDateTime(random: MockRandom): unknown {
  const d = randomDateParts(random);
  const tm = randomTimeParts(random);
  return temporal().PlainDateTime.from(
    `${pad(d.year, 4)}-${pad(d.month)}-${pad(d.day)}T${pad(tm.hour)}:${pad(tm.minute)}:${pad(tm.second)}`
  );
}
function mockPlainYearMonth(random: MockRandom): unknown {
  const d = randomDateParts(random);
  return temporal().PlainYearMonth.from(`${pad(d.year, 4)}-${pad(d.month)}`);
}
function mockPlainMonthDay(random: MockRandom): unknown {
  const d = randomDateParts(random);
  return temporal().PlainMonthDay.from(`${pad(d.month)}-${pad(d.day)}`);
}
function mockInstant(random: MockRandom): unknown {
  // Random epoch ms within a few decades around the epoch.
  return temporal().Instant.fromEpochMilliseconds(random.int(0, 4102444800000));
}
function mockZonedDateTime(random: MockRandom): unknown {
  const d = randomDateParts(random);
  const tm = randomTimeParts(random);
  return temporal().ZonedDateTime.from(
    `${pad(d.year, 4)}-${pad(d.month)}-${pad(d.day)}T${pad(tm.hour)}:${pad(tm.minute)}:${pad(tm.second)}[UTC]`
  );
}
function mockDuration(random: MockRandom): unknown {
  // A simple, always-valid positive duration.
  return temporal().Duration.from(
    `P${random.int(0, 5)}Y${random.int(0, 11)}M${random.int(0, 27)}DT${random.int(0, 23)}H${random.int(0, 59)}M${random.int(0, 59)}S`
  );
}

// ───────────────────────────── bounded mocking ─────────────────────────────

/** The bound set carried by a FormatTemporalX brand. Each is an absolute
 *  Temporal string literal or a relative `now±P…` spec. **/
export interface TemporalBounds {
  min?: string;
  max?: string;
  gt?: string;
  lt?: string;
}

// Nanoseconds per day — the PlainDate grid (a date-only type steps by whole
// days, so an exclusive `gt`/`lt` excludes the bound date itself).
const NS_PER_DAY = 86_400_000_000_000n;

// A BoundAdapter maps an orderable Temporal type to a single comparable key
// (bigint) and back, plus the grid step for exclusive-bound nudging and the
// `now` / `from(literal)` constructors used to resolve relative + absolute
// bounds. The instant-like keys are epoch nanoseconds via the UTC zone;
// PlainYearMonth uses a month index.
interface BoundAdapter {
  grid: bigint;
  now(): unknown;
  fromLiteral(literal: string): unknown;
  key(instance: unknown): bigint;
  fromKey(key: bigint): unknown;
  fallback(): unknown;
}

const REF_DATE = '1970-01-01'; // anchor for PlainTime ↔ epoch-ns

// instantFromNs / nsOf bridge any instant-like instance through a UTC
// ZonedDateTime so a single ns scale serves Instant / ZonedDateTime /
// PlainDate / PlainTime / PlainDateTime.
function instantFromNs(ns: bigint): {toZonedDateTimeISO(tz: string): unknown} {
  return temporal().Instant.fromEpochNanoseconds(ns) as {toZonedDateTimeISO(tz: string): unknown};
}

function boundAdapter(subKind: number, random: MockRandom): BoundAdapter | undefined {
  const T = temporal();
  switch (subKind) {
    case RunTypeSubKind.temporalInstant:
      return {
        grid: 1n,
        now: () => T.Now.instant(),
        fromLiteral: (s) => T.Instant.from(s),
        key: (i) => (i as {epochNanoseconds: bigint}).epochNanoseconds,
        fromKey: (k) => T.Instant.fromEpochNanoseconds(k),
        fallback: () => mockInstant(random),
      };
    case RunTypeSubKind.temporalZonedDateTime:
      return {
        grid: 1n,
        now: () => T.Now.zonedDateTimeISO(),
        fromLiteral: (s) => T.ZonedDateTime.from(s),
        key: (i) => (i as {epochNanoseconds: bigint}).epochNanoseconds,
        fromKey: (k) => instantFromNs(k).toZonedDateTimeISO('UTC'),
        fallback: () => mockZonedDateTime(random),
      };
    case RunTypeSubKind.temporalPlainDate:
      return {
        grid: NS_PER_DAY,
        now: () => T.Now.plainDateISO(),
        fromLiteral: (s) => T.PlainDate.from(s),
        key: (i) => (i as {toZonedDateTime(tz: string): {epochNanoseconds: bigint}}).toZonedDateTime('UTC').epochNanoseconds,
        fromKey: (k) => (instantFromNs(k).toZonedDateTimeISO('UTC') as {toPlainDate(): unknown}).toPlainDate(),
        fallback: () => mockPlainDate(random),
      };
    case RunTypeSubKind.temporalPlainTime:
      return {
        grid: 1n,
        now: () => T.Now.plainTimeISO(),
        fromLiteral: (s) => T.PlainTime.from(s),
        key: (i) =>
          (T.PlainDate.from(REF_DATE) as {toPlainDateTime(t: unknown): {toZonedDateTime(tz: string): {epochNanoseconds: bigint}}})
            .toPlainDateTime(i)
            .toZonedDateTime('UTC').epochNanoseconds,
        fromKey: (k) => (instantFromNs(k).toZonedDateTimeISO('UTC') as {toPlainTime(): unknown}).toPlainTime(),
        fallback: () => mockPlainTime(random),
      };
    case RunTypeSubKind.temporalPlainDateTime:
      return {
        grid: 1n,
        now: () => T.Now.plainDateTimeISO(),
        fromLiteral: (s) => T.PlainDateTime.from(s),
        key: (i) => (i as {toZonedDateTime(tz: string): {epochNanoseconds: bigint}}).toZonedDateTime('UTC').epochNanoseconds,
        fromKey: (k) => (instantFromNs(k).toZonedDateTimeISO('UTC') as {toPlainDateTime(): unknown}).toPlainDateTime(),
        fallback: () => mockPlainDateTime(random),
      };
    case RunTypeSubKind.temporalPlainYearMonth:
      return {
        grid: 1n, // one month
        now: () => T.Now.plainDateISO(),
        fromLiteral: (s) => T.PlainYearMonth.from(s),
        key: (i) => {
          const ym = i as {year: number; month: number};
          return BigInt(ym.year) * 12n + BigInt(ym.month - 1);
        },
        fromKey: (k) => T.PlainYearMonth.from({year: Number(k / 12n), month: Number(k % 12n) + 1}),
        fallback: () => mockPlainYearMonth(random),
      };
    default:
      return undefined;
  }
}

// shift offsets a Temporal instance by a relative `now±P…` duration tail
// (e.g. '-P1Y' / '+PT1H'), mirroring the emitter's add/subtract.
function shift(instance: unknown, sign: number, durationStr: string): unknown {
  const duration = temporal().Duration.from(durationStr);
  const shiftable = instance as Shiftable;
  return sign < 0 ? shiftable.subtract(duration) : shiftable.add(duration);
}

// boundKey resolves one bound string (absolute literal or relative now±P) to
// the adapter's comparable key.
function boundKey(adapter: BoundAdapter, bound: string): bigint {
  if (bound.startsWith('now')) {
    const rest = bound.slice(3);
    let instance = adapter.now();
    if (rest) instance = shift(instance, rest[0] === '-' ? -1 : 1, rest.slice(1));
    return adapter.key(instance);
  }
  return adapter.key(adapter.fromLiteral(bound));
}

// randomBigIntBelow returns a uniform-ish bigint in [0, n) for n > 0, drawing
// 30 random bits at a time (mocking needs spread, not cryptographic quality).
function randomBigIntBelow(n: bigint, random: MockRandom): bigint {
  if (n <= 1n) return 0n;
  const bits = n.toString(2).length;
  const mask = (1n << BigInt(bits)) - 1n;
  let result: bigint;
  do {
    result = 0n;
    for (let b = 0; b < bits; b += 30) {
      result = (result << 30n) | BigInt(Math.floor(random.float() * (1 << 30)));
    }
    result &= mask;
  } while (result >= n);
  return result;
}

function randBigInt(lo: bigint, hi: bigint, random: MockRandom): bigint {
  if (hi <= lo) return lo;
  return lo + randomBigIntBelow(hi - lo + 1n, random);
}

// mockBoundedTemporal returns a value of the orderable Temporal type for
// `adapter` satisfying the bound set, or the adapter's unbounded fallback
// when no bound is set.
function mockBoundedTemporal(adapter: BoundAdapter, bounds: TemporalBounds, random: MockRandom): unknown {
  let lo: bigint | undefined;
  let hi: bigint | undefined;
  const raise = (candidate: bigint): void => {
    if (lo === undefined || candidate > lo) lo = candidate;
  };
  const lower = (candidate: bigint): void => {
    if (hi === undefined || candidate < hi) hi = candidate;
  };
  if (bounds.min !== undefined) raise(boundKey(adapter, bounds.min));
  if (bounds.gt !== undefined) raise(boundKey(adapter, bounds.gt) + adapter.grid);
  if (bounds.max !== undefined) lower(boundKey(adapter, bounds.max));
  if (bounds.lt !== undefined) lower(boundKey(adapter, bounds.lt) - adapter.grid);
  if (lo === undefined && hi === undefined) return adapter.fallback();
  // Back the absent edge off the present one by ~50 years (in the adapter's
  // grid) so an open-ended bound still yields varied values.
  const spread = adapter.grid * 18_250n;
  if (lo === undefined) lo = (hi as bigint) - spread;
  if (hi === undefined) hi = lo + spread;
  if (hi < lo) hi = lo; // contradictory bounds — collapse to the lower edge
  return adapter.fromKey(randBigInt(lo, hi, random));
}

// mockTemporal returns a random valid instance for a Temporal SubKind
// (honoring FormatTemporalX bounds when present), or undefined when the
// subKind isn't a Temporal type (caller falls through).
export function mockTemporal(subKind: number, bounds: TemporalBounds | undefined, random: MockRandom): unknown {
  if (bounds) {
    const adapter = boundAdapter(subKind, random);
    if (adapter) return mockBoundedTemporal(adapter, bounds, random);
  }
  switch (subKind) {
    case RunTypeSubKind.temporalInstant:
      return mockInstant(random);
    case RunTypeSubKind.temporalZonedDateTime:
      return mockZonedDateTime(random);
    case RunTypeSubKind.temporalPlainDate:
      return mockPlainDate(random);
    case RunTypeSubKind.temporalPlainTime:
      return mockPlainTime(random);
    case RunTypeSubKind.temporalPlainDateTime:
      return mockPlainDateTime(random);
    case RunTypeSubKind.temporalPlainYearMonth:
      return mockPlainYearMonth(random);
    case RunTypeSubKind.temporalPlainMonthDay:
      return mockPlainMonthDay(random);
    case RunTypeSubKind.temporalDuration:
      return mockDuration(random);
    default:
      return undefined;
  }
}

// temporalBoundsFromAnnotation extracts the {min,max,gt,lt} bound set from a
// FormatTemporalX brand's params, or undefined when no bound is set (or the
// annotation isn't a Temporal format).
export function temporalBoundsFromAnnotation(
  annotation: {name?: string; params?: Record<string, unknown>} | undefined
): TemporalBounds | undefined {
  if (!annotation || !annotation.name || !annotation.name.startsWith('temporal')) return undefined;
  const params = annotation.params ?? {};
  const pick = (key: string): string | undefined => (typeof params[key] === 'string' ? (params[key] as string) : undefined);
  const min = pick('min');
  const max = pick('max');
  const gt = pick('gt');
  const lt = pick('lt');
  if (min === undefined && max === undefined && gt === undefined && lt === undefined) return undefined;
  return {min, max, gt, lt};
}

// isTemporalSubKind reports whether a numeric subKind is a Temporal type.
export function isTemporalSubKind(subKind: number | undefined): boolean {
  return subKind !== undefined && subKind >= RunTypeSubKind.temporalInstant && subKind <= RunTypeSubKind.temporalDuration;
}
