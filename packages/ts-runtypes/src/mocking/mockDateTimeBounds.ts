// Bound-aware mock helpers for the date / time / dateTime string formats
// and the native Date format. A mock value MUST re-pass validate for the
// same type, which means it must satisfy the format's min/max bounds.
//
// The validator compares a value's "key" against the bound's key on a
// per-kind scale (see internal/cachegen/typefunctions/formats/datetime/{literals,
// boundcodegen}.go and the dateStrToMs / timeStrToMs / relativeNowKey pure
// fns in ./../formats/datetime/dateTime-pure-fns.ts):
//   - date  → UTC epoch ms floored to midnight ('epochDate')
//   - time  → milliseconds-of-day ('timeOfDay')
//   - dateTime / native Date → UTC epoch ms ('epoch')
//
// Mocking is the inverse: resolve [minKey, maxKey] on that scale, pick a
// random key in range, then FORMAT it back into the layout. Formatting
// truncates to the layout's grid (e.g. YYYY-MM drops the day); because the
// bounds are themselves valid, grid-aligned literals (the Go validator
// rejects anything else with FMT002), truncation is monotonic with a fixed
// point at each bound, so the formatted value's re-parsed key stays within
// [minKey, maxKey]. This module therefore MUST mirror the validator's scale
// math exactly — keep it in sync with literals.go / dateTime-pure-fns.ts.

import type {DateFmt, TimeFmt, DateTimeParams} from '../formats/datetime/stringDateTimeFormats.ts';
import type {MockRandom} from './mockRandom.ts';

// Fill year for yearless date layouts (MM-DD / DD-MM) — MUST match Go's
// defaultFillYear (literals.go) and the JS dateStrToMs fill (a leap year so
// 02-29 is representable).
const FILL_YEAR = 2000;

const MS_PER_DAY = 86400000;
const MS_PER_HOUR = 3600000;
const MS_PER_MIN = 60000;
const MS_PER_SEC = 1000;

// Inclusive integer draw that returns `min` WITHOUT drawing when the range
// collapses — preserving the exact draw sequence (a collapsed date bound must
// not consume a PRNG step). Uses `float()` (not `int`) for the same reason.
function randInt(min: number, max: number, random: MockRandom): number {
  if (max <= min) return min;
  return min + Math.floor(random.float() * (max - min + 1));
}

// ─────────────────────── relative now±P resolution ───────────────────────
// Mirror of relativeNowKey in dateTime-pure-fns.ts. `scale` is one of
// 'epoch' | 'epochDate' | 'timeOfDay'.

type RelScale = 'epoch' | 'epochDate' | 'timeOfDay';

function isRelative(bound: string): boolean {
  return bound.startsWith('now');
}

function parseDuration(tail: string): {
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const out = {years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0};
  const body = tail.substring(1); // drop leading 'P'
  const tIdx = body.indexOf('T');
  const datePart = tIdx === -1 ? body : body.substring(0, tIdx);
  const timePart = tIdx === -1 ? '' : body.substring(tIdx + 1);
  const eat = (segment: string, map: Record<string, keyof typeof out>): void => {
    const re = /(\d+)([A-Z])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(segment)) !== null) {
      const key = map[m[2]];
      if (key) out[key] = Number(m[1]);
    }
  };
  eat(datePart, {Y: 'years', M: 'months', W: 'weeks', D: 'days'});
  eat(timePart, {H: 'hours', M: 'minutes', S: 'seconds'});
  return out;
}

function resolveRelative(spec: string, scale: RelScale, random: MockRandom): number {
  // Wall clock via `random.now()`: live `Date.now()` natively, a fixed
  // reference instant under a seed so relative `now±P` bounds stay repeatable.
  const now = new Date(random.now());
  if (scale === 'timeOfDay') {
    let ms =
      now.getUTCHours() * MS_PER_HOUR +
      now.getUTCMinutes() * MS_PER_MIN +
      now.getUTCSeconds() * MS_PER_SEC +
      now.getUTCMilliseconds();
    if (spec !== 'now') {
      const sign = spec[3] === '-' ? -1 : 1;
      const d = parseDuration(spec.substring(4));
      ms += sign * (d.hours * MS_PER_HOUR + d.minutes * MS_PER_MIN + d.seconds * MS_PER_SEC);
    }
    return ms;
  }
  const result = new Date(now.getTime());
  if (spec !== 'now') {
    const sign = spec[3] === '-' ? -1 : 1;
    const d = parseDuration(spec.substring(4));
    result.setUTCFullYear(result.getUTCFullYear() + sign * d.years);
    result.setUTCMonth(result.getUTCMonth() + sign * d.months);
    result.setUTCDate(result.getUTCDate() + sign * (d.weeks * 7 + d.days));
    result.setTime(result.getTime() + sign * (d.hours * MS_PER_HOUR + d.minutes * MS_PER_MIN + d.seconds * MS_PER_SEC));
  }
  if (scale === 'epochDate') {
    return Date.UTC(result.getUTCFullYear(), result.getUTCMonth(), result.getUTCDate(), 0, 0, 0, 0);
  }
  return result.getTime();
}

// ───────────────────────── absolute literal parsing ─────────────────────────
// Mirrors of dateStrToMs / timeStrToMs / dateTimeEpochMs.

function dateLiteralToMs(value: string, layout: DateFmt): number {
  const parts = value.split('-');
  let year = FILL_YEAR;
  let month = 1;
  let day = 1;
  switch (layout) {
    case 'DD-MM-YYYY':
      day = Number(parts[0]);
      month = Number(parts[1]);
      year = Number(parts[2]);
      break;
    case 'MM-DD-YYYY':
      month = Number(parts[0]);
      day = Number(parts[1]);
      year = Number(parts[2]);
      break;
    case 'YYYY-MM':
      year = Number(parts[0]);
      month = Number(parts[1]);
      break;
    case 'MM-DD':
      month = Number(parts[0]);
      day = Number(parts[1]);
      break;
    case 'DD-MM':
      day = Number(parts[0]);
      month = Number(parts[1]);
      break;
    default: // ISO / YYYY-MM-DD
      year = Number(parts[0]);
      month = Number(parts[1]);
      day = Number(parts[2]);
  }
  return Date.UTC(year, month - 1, day, 0, 0, 0, 0);
}

function timeLiteralToMs(value: string, layout: TimeFmt): number {
  let body = value;
  if (layout === 'ISO' || layout === 'HH:mm:ss[.mmm]TZ') {
    if (body.endsWith('Z') || body.endsWith('z')) body = body.substring(0, body.length - 1);
    else {
      const plus = body.indexOf('+');
      const minus = body.lastIndexOf('-');
      const cut = plus !== -1 ? plus : minus;
      if (cut > 0) body = body.substring(0, cut);
    }
  }
  if (layout === 'HH') return Number(body) * MS_PER_HOUR;
  if (layout === 'mm') return Number(body) * MS_PER_MIN;
  if (layout === 'ss') return Number(body) * MS_PER_SEC;
  const parts = body.split(':');
  if (layout === 'HH:mm') return Number(parts[0]) * MS_PER_HOUR + Number(parts[1]) * MS_PER_MIN;
  if (layout === 'mm:ss') return Number(parts[0]) * MS_PER_MIN + Number(parts[1]) * MS_PER_SEC;
  // HH:mm:ss, HH:mm:ss[.mmm], ISO — three segments. The seconds segment may
  // be absent when a dateTime bound's time half uses a coarser layout (e.g.
  // an 'HH:mm' time joined under a dateTime literal parsed leniently as ISO).
  const secParts = (parts[2] ?? '').split('.');
  return (
    Number(parts[0]) * MS_PER_HOUR +
    Number(parts[1]) * MS_PER_MIN +
    (secParts[0] ? Number(secParts[0]) : 0) * MS_PER_SEC +
    (secParts[1] ? Number(secParts[1]) : 0)
  );
}

function dateTimeLiteralToMs(value: string, splitChar: string): number {
  const sep = splitChar || 'T';
  const idx = value.indexOf(sep);
  if (idx < 0) return Date.parse(value);
  const dateMs = dateLiteralToMs(value.substring(0, idx), 'YYYY-MM-DD');
  // Lenient time parse — the time half can be any valid time layout; ISO/TZ
  // parser handles the superset.
  const timeMs = timeLiteralToMs(value.substring(idx + sep.length), 'ISO');
  return dateMs + timeMs;
}

// ───────────────────────────── key resolution ─────────────────────────────

// resolveDateKey returns the epoch-ms (UTC midnight) bound for a date format.
function resolveDateKey(bound: string, layout: DateFmt, random: MockRandom): number {
  return isRelative(bound) ? resolveRelative(bound, 'epochDate', random) : dateLiteralToMs(bound, layout);
}

function resolveTimeKey(bound: string, layout: TimeFmt, random: MockRandom): number {
  return isRelative(bound) ? resolveRelative(bound, 'timeOfDay', random) : timeLiteralToMs(bound, layout);
}

function resolveEpochKey(bound: string, splitChar: string, random: MockRandom): number {
  return isRelative(bound) ? resolveRelative(bound, 'epoch', random) : dateTimeLiteralToMs(bound, splitChar);
}

// ───────────────────────────── formatting ─────────────────────────────

function formatDate(ms: number, layout: DateFmt): string {
  const d = new Date(ms);
  const year = String(d.getUTCFullYear()).padStart(4, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  switch (layout) {
    case 'DD-MM-YYYY':
      return `${day}-${month}-${year}`;
    case 'MM-DD-YYYY':
      return `${month}-${day}-${year}`;
    case 'YYYY-MM':
      return `${year}-${month}`;
    case 'MM-DD':
      return `${month}-${day}`;
    case 'DD-MM':
      return `${day}-${month}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

function formatTime(msOfDay: number, layout: TimeFmt): string {
  const h = Math.floor(msOfDay / MS_PER_HOUR);
  const m = Math.floor((msOfDay % MS_PER_HOUR) / MS_PER_MIN);
  const s = Math.floor((msOfDay % MS_PER_MIN) / MS_PER_SEC);
  const ms = msOfDay % MS_PER_SEC;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  const mmm = String(ms).padStart(3, '0');
  switch (layout) {
    case 'ISO':
    case 'HH:mm:ss[.mmm]TZ':
      return `${hh}:${mm}:${ss}.${mmm}Z`;
    case 'HH:mm:ss[.mmm]':
      return `${hh}:${mm}:${ss}.${mmm}`;
    case 'HH:mm:ss':
      return `${hh}:${mm}:${ss}`;
    case 'HH:mm':
      return `${hh}:${mm}`;
    case 'mm:ss':
      return `${mm}:${ss}`;
    case 'HH':
      return hh;
    case 'mm':
      return mm;
    case 'ss':
      return ss;
    default:
      return `${hh}:${mm}:${ss}`;
  }
}

// ─────────────────────── default (unbounded) ranges ───────────────────────

// Full representable date range as epoch ms (year 1 .. 9999), matching the
// validator's accepted range so an absent bound spans everything.
const DATE_MIN_MS = Date.UTC(1, 0, 1, 0, 0, 0, 0);
const DATE_MAX_MS = Date.UTC(9999, 11, 31, 0, 0, 0, 0);

// Max ms-of-day per time layout (the layout's grid ceiling).
function timeMaxMs(layout: TimeFmt): number {
  switch (layout) {
    case 'HH':
      return 23 * MS_PER_HOUR;
    case 'mm':
      return 59 * MS_PER_MIN;
    case 'ss':
      return 59 * MS_PER_SEC;
    case 'HH:mm':
      return 23 * MS_PER_HOUR + 59 * MS_PER_MIN;
    case 'mm:ss':
      return 59 * MS_PER_MIN + 59 * MS_PER_SEC;
    case 'HH:mm:ss':
      return 23 * MS_PER_HOUR + 59 * MS_PER_MIN + 59 * MS_PER_SEC;
    default: // ISO / HH:mm:ss[.mmm](TZ)
      return 23 * MS_PER_HOUR + 59 * MS_PER_MIN + 59 * MS_PER_SEC + 999;
  }
}

// timeGridMs is the smallest representable step for a time layout — used as
// the exclusive-bound nudge so a `gt`/`lt` bound excludes its own
// grid-aligned value (e.g. `gt: '08:00'` on `HH:mm` starts at 08:01).
function timeGridMs(layout: TimeFmt): number {
  switch (layout) {
    case 'HH':
      return MS_PER_HOUR;
    case 'mm':
    case 'HH:mm':
      return MS_PER_MIN;
    case 'ss':
    case 'mm:ss':
    case 'HH:mm:ss':
      return MS_PER_SEC;
    default: // ISO / HH:mm:ss[.mmm](TZ) — millisecond resolution
      return 1;
  }
}

// ─────────────────────── bound set → inclusive range ───────────────────────
// The four bounds (min/max inclusive, gt/lt exclusive) collapse to one
// inclusive [lo, hi] key range. min/gt set the lower edge, max/lt the upper;
// the exclusive twins are nudged inward by one `grid` step (the smallest
// representable unit on the value's scale) so a strictly-greater/less bound
// excludes its own key. The tightest edge wins when several are present.

// MinMax-shaped bound inputs, already string|undefined.
interface BoundInputs {
  min?: string;
  max?: string;
  gt?: string;
  lt?: string;
}

// resolveRange collapses the bound set to [lo, hi] inclusive keys. `resolve`
// maps a bound string to its key on the scale; defaultLo/defaultHi back the
// absent edges; grid is one representable step for the exclusive nudge.
function resolveRange(
  bounds: BoundInputs,
  resolve: (bound: string) => number,
  defaultLo: number,
  defaultHi: number,
  grid: number
): {lo: number; hi: number} {
  let lo = defaultLo;
  let hi = defaultHi;
  if (bounds.min !== undefined) lo = Math.max(lo, resolve(bounds.min));
  if (bounds.gt !== undefined) lo = Math.max(lo, resolve(bounds.gt) + grid);
  if (bounds.max !== undefined) hi = Math.min(hi, resolve(bounds.max));
  if (bounds.lt !== undefined) hi = Math.min(hi, resolve(bounds.lt) - grid);
  // Guard against an inverted range (a contradictory or relative-clock
  // bound set) — collapse to the lower edge so randInt stays well-defined.
  if (hi < lo) hi = lo;
  return {lo, hi};
}

// ───────────────────────────── public builders ─────────────────────────────

// mockBoundedDate returns a date string in `layout` within the bound set
// (each bound optional, absolute literal or relative now±P).
export function mockBoundedDate(layout: DateFmt, bounds: BoundInputs, random: MockRandom): string {
  const {lo, hi} = resolveRange(bounds, (b) => resolveDateKey(b, layout, random), DATE_MIN_MS, DATE_MAX_MS, MS_PER_DAY);
  return formatDate(randInt(lo, hi, random), layout);
}

// mockBoundedTime returns a time string in `layout` within the bound set.
// The grid step is the layout's smallest representable unit so an exclusive
// bound excludes its own grid-aligned value.
export function mockBoundedTime(layout: TimeFmt, bounds: BoundInputs, random: MockRandom): string {
  const grid = timeGridMs(layout);
  const {lo, hi} = resolveRange(bounds, (b) => resolveTimeKey(b, layout, random), 0, timeMaxMs(layout), grid);
  return formatTime(randInt(lo, hi, random), layout);
}

// mockBoundedDateTime returns a dateTime string honoring the nested layouts,
// splitChar, and top-level min/max/gt/lt bounds.
export function mockBoundedDateTime(params: Partial<DateTimeParams>, random: MockRandom): string {
  const dateLayout = (params.date?.format ?? 'ISO') as DateFmt;
  const timeLayout = (params.time?.format ?? 'ISO') as TimeFmt;
  const splitChar = params.splitChar ?? 'T';
  const bounds: BoundInputs = {min: params.min, max: params.max, gt: params.gt, lt: params.lt};
  if (bounds.min === undefined && bounds.max === undefined && bounds.gt === undefined && bounds.lt === undefined) {
    return `${mockBoundedDate(dateLayout, {}, random)}${splitChar}${mockBoundedTime(timeLayout, {}, random)}`;
  }
  const {lo, hi} = resolveRange(
    bounds,
    (b) => resolveEpochKey(b, splitChar, random),
    DATE_MIN_MS,
    DATE_MAX_MS + timeMaxMs(timeLayout),
    timeGridMs(timeLayout)
  );
  const pick = randInt(lo, hi, random);
  // Split the picked instant into a UTC-midnight date part + the remaining
  // time-of-day, format each in its layout. Truncation to each layout grid is
  // monotonic with fixed points at the (grid-aligned) bounds, keeping the
  // re-parsed key within [lo, hi].
  const dayMs = Math.floor(pick / MS_PER_DAY) * MS_PER_DAY;
  const timeOfDay = pick - dayMs;
  return `${formatDate(dayMs, dateLayout)}${splitChar}${formatTime(timeOfDay, timeLayout)}`;
}

// mockBoundedNativeDate returns a Date within the bound set for Date.
// The scale is full UTC epoch ms; the exclusive grid step is 1 ms (a Date's
// resolution).
export function mockBoundedNativeDate(bounds: BoundInputs, random: MockRandom): Date {
  // `random.now()` for the default upper bound: live `Date.now()` natively, a
  // fixed reference instant under a seed.
  const {lo, hi} = resolveRange(bounds, (b) => resolveEpochKey(b, 'T', random), DATE_MIN_MS, random.now(), 1);
  return new Date(randInt(lo, hi, random));
}
