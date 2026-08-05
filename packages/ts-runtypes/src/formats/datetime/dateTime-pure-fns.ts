// Registration module for the date / time pure fns the Go-side
// date/time/dateTime/nativeDate emitters reach via
// `utl.getPureFn('rtFormats::<name>')`. Moved out of
// ../string/string-formats-pure-fns.ts so the whole date-ish surface
// lives together; the Go path constant `dateTimePureFnFilePath` in
// internal/cachegen/typefunctions/formats/datetime/shared.go MUST match this
// file's location or the pure-fn extractor won't ship these bodies.
//
// Importing this file from ../index.ts (the `ts-runtypes/
// formats` subpath surface) guarantees the registrations run before any
// user code references a date/time/dateTime/Date format type.

import {registerPureFnFactory} from '../../runtypes/pureFn.ts';
import type {RTUtils} from '../../runtypes/rtUtils.ts';

// IsDateStringFn — shape the base pf_isDateString resolves to, used to
// type the getPureFn lookups in the layout wrappers below.
type IsDateStringFn = (year: string | undefined, month: string, day?: string) => boolean;
type SegmentFn = (segment: string) => boolean;

// ############### Date pure fns ###############
//
// pf_isDateString is the base leap-year-aware validator; the six
// layout wrappers split on '-' and delegate. Wrappers reach the base fn
// via utl.getPureFn so the Go extractor records the transitive dep.

registerPureFnFactory('rtFormats::isDateString', function () {
  return function _isDateString(year: string | undefined, month: string, day?: string): boolean {
    let y: number | undefined;
    if (year) {
      if (year.length !== 4) return false;
      y = Number(year);
      if (isNaN(y) || y < 0 || y > 9999) return false;
    }
    if (month.length !== 2) return false;
    const m = Number(month);
    if (isNaN(m) || m < 1 || m > 12) return false;
    if (day) {
      if (day.length !== 2) return false;
      const d = Number(day);
      if (isNaN(d) || d < 1 || d > 31) return false;
      if (m === 2) {
        if (d > 29) return false;
        if (y && d === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) return false;
      } else if ((m === 4 || m === 6 || m === 9 || m === 11) && d > 30) {
        return false;
      }
    }
    return true;
  };
});

registerPureFnFactory('rtFormats::isDateString_YMD', function (utl: RTUtils) {
  const isDate = utl.getPureFn('rtFormats::isDateString') as IsDateStringFn;
  return function _is_ymd(value: string): boolean {
    const parts = value.split('-');
    return parts.length === 3 && isDate(parts[0], parts[1], parts[2]);
  };
});

registerPureFnFactory('rtFormats::isDateString_DMY', function (utl: RTUtils) {
  const isDate = utl.getPureFn('rtFormats::isDateString') as IsDateStringFn;
  return function _is_dmy(value: string): boolean {
    const parts = value.split('-');
    return parts.length === 3 && isDate(parts[2], parts[1], parts[0]);
  };
});

registerPureFnFactory('rtFormats::isDateString_MDY', function (utl: RTUtils) {
  const isDate = utl.getPureFn('rtFormats::isDateString') as IsDateStringFn;
  return function _is_mdy(value: string): boolean {
    const parts = value.split('-');
    return parts.length === 3 && isDate(parts[2], parts[0], parts[1]);
  };
});

registerPureFnFactory('rtFormats::isDateString_YM', function (utl: RTUtils) {
  const isDate = utl.getPureFn('rtFormats::isDateString') as IsDateStringFn;
  return function _is_ym(value: string): boolean {
    const parts = value.split('-');
    return parts.length === 2 && isDate(parts[0], parts[1]);
  };
});

registerPureFnFactory('rtFormats::isDateString_MD', function (utl: RTUtils) {
  const isDate = utl.getPureFn('rtFormats::isDateString') as IsDateStringFn;
  return function _is_md(value: string): boolean {
    const parts = value.split('-');
    return parts.length === 2 && isDate(undefined, parts[0], parts[1]);
  };
});

registerPureFnFactory('rtFormats::isDateString_DM', function (utl: RTUtils) {
  const isDate = utl.getPureFn('rtFormats::isDateString') as IsDateStringFn;
  return function _is_dm(value: string): boolean {
    const parts = value.split('-');
    return parts.length === 2 && isDate(undefined, parts[1], parts[0]);
  };
});

// ############### Time pure fns ###############

// Each segment is exactly TWO ASCII digits. `Number()` alone accepted a single
// digit ('8:3:6'), leading whitespace, and 0x-prefixed hex, none of which is a
// time; the digit class also keeps non-ASCII numerals out.
registerPureFnFactory('rtFormats::isHours', function () {
  const twoDigitsRegexp = /^[0-9]{2}$/;
  return function _is_h(hours: string): boolean {
    return twoDigitsRegexp.test(hours) && Number(hours) <= 23;
  };
});

registerPureFnFactory('rtFormats::isMinutes', function () {
  const twoDigitsRegexp = /^[0-9]{2}$/;
  return function _is_m(mins: string): boolean {
    return twoDigitsRegexp.test(mins) && Number(mins) <= 59;
  };
});

registerPureFnFactory('rtFormats::isSeconds', function () {
  const twoDigitsRegexp = /^[0-9]{2}$/;
  return function _is_s(secs: string): boolean {
    return twoDigitsRegexp.test(secs) && Number(secs) <= 59;
  };
});

// Seconds with an optional MILLISECOND fraction — exactly three digits, because
// this backs the layouts that name them (`HH:mm:ss.sss`). The RFC 3339 rule,
// where the fraction may be any length, lives in isSecondsWithLeap below; the
// two are deliberately different questions.
registerPureFnFactory('rtFormats::isSecondsWithMs', function (utl: RTUtils) {
  const isS = utl.getPureFn('rtFormats::isSeconds') as SegmentFn;
  const msRegexp = /^[0-9]{3}$/;
  return function _is_s_ms(secsAndMs: string): boolean {
    const dot = secsAndMs.indexOf('.');
    if (dot === -1) return isS(secsAndMs);
    return isS(secsAndMs.substring(0, dot)) && msRegexp.test(secsAndMs.substring(dot + 1));
  };
});

// The same, but tolerating second 60. Whether that leap second is REAL depends
// on the offset, which only the full-time validator knows, so this one just
// admits it and isTimeString_ISO_TZ decides.
registerPureFnFactory('rtFormats::isSecondsWithLeap', function () {
  const twoDigitsRegexp = /^[0-9]{2}$/;
  const fractionRegexp = /^[0-9]+$/;
  return function _is_s_leap(secsAndMs: string): boolean {
    const dot = secsAndMs.indexOf('.');
    const secs = dot === -1 ? secsAndMs : secsAndMs.substring(0, dot);
    if (dot !== -1 && !fractionRegexp.test(secsAndMs.substring(dot + 1))) return false;
    return twoDigitsRegexp.test(secs) && Number(secs) <= 60;
  };
});

registerPureFnFactory('rtFormats::isTimeZone', function (utl: RTUtils) {
  const isH = utl.getPureFn('rtFormats::isHours') as SegmentFn;
  const isM = utl.getPureFn('rtFormats::isMinutes') as SegmentFn;
  return function _is_tz(timeZone: string): boolean {
    if (timeZone === 'Z' || timeZone === 'z') return true;
    const parts = timeZone.split(':');
    return parts.length === 2 && isH(parts[0]) && isM(parts[1]);
  };
});

registerPureFnFactory('rtFormats::isTimeString_ISO', function (utl: RTUtils) {
  const isH = utl.getPureFn('rtFormats::isHours') as SegmentFn;
  const isM = utl.getPureFn('rtFormats::isMinutes') as SegmentFn;
  const isSms = utl.getPureFn('rtFormats::isSecondsWithMs') as SegmentFn;
  return function _is_iso(value: string): boolean {
    const parts = value.split(':');
    return parts.length === 3 && isH(parts[0]) && isM(parts[1]) && isSms(parts[2]);
  };
});

// RFC 3339 full-time: HH:MM:SS[.frac] then `Z` or a ±HH:MM offset.
//
// The offset is parsed here rather than delegated because of the leap second: a
// second of 60 is only real at 23:59:60 UTC, so `23:59:60+01:00` (22:59 UTC) is
// invalid while `01:29:60+01:30` is the same instant as `23:59:60Z` and valid.
// That answer needs the local time and the offset together, which is only true
// at this level.
registerPureFnFactory('rtFormats::isTimeString_ISO_TZ', function (utl: RTUtils) {
  const isH = utl.getPureFn('rtFormats::isHours') as SegmentFn;
  const isM = utl.getPureFn('rtFormats::isMinutes') as SegmentFn;
  const isSecs = utl.getPureFn('rtFormats::isSecondsWithLeap') as SegmentFn;
  const MINUTES_PER_DAY = 1440;
  return function _is_iso_tz(value: string): boolean {
    let time: string;
    let offsetMinutes: number;
    const last = value[value.length - 1];
    if (last === 'Z' || last === 'z') {
      time = value.substring(0, value.length - 1);
      offsetMinutes = 0;
    } else {
      // An offset is always exactly `±HH:MM`, so its sign sits six from the end.
      const at = value.length - 6;
      const sign = at >= 0 ? value[at] : '';
      if (sign !== '+' && sign !== '-') return false;
      time = value.substring(0, at);
      const offset = value.substring(at + 1).split(':');
      if (offset.length !== 2 || !isH(offset[0]) || !isM(offset[1])) return false;
      offsetMinutes = (Number(offset[0]) * 60 + Number(offset[1])) * (sign === '-' ? -1 : 1);
    }
    const parts = time.split(':');
    if (parts.length !== 3) return false;
    if (!isH(parts[0]) || !isM(parts[1]) || !isSecs(parts[2])) return false;
    if (Number(parts[2].substring(0, 2)) !== 60) return true;
    const utcMinutes = (Number(parts[0]) * 60 + Number(parts[1]) - offsetMinutes + MINUTES_PER_DAY * 2) % MINUTES_PER_DAY;
    return utcMinutes === 23 * 60 + 59;
  };
});

registerPureFnFactory('rtFormats::isTimeString_HHmmss', function (utl: RTUtils) {
  const isH = utl.getPureFn('rtFormats::isHours') as SegmentFn;
  const isM = utl.getPureFn('rtFormats::isMinutes') as SegmentFn;
  const isS = utl.getPureFn('rtFormats::isSeconds') as SegmentFn;
  return function _is_hhmmss(value: string): boolean {
    const parts = value.split(':');
    return parts.length === 3 && isH(parts[0]) && isM(parts[1]) && isS(parts[2]);
  };
});

registerPureFnFactory('rtFormats::isTimeString_HHmm', function (utl: RTUtils) {
  const isH = utl.getPureFn('rtFormats::isHours') as SegmentFn;
  const isM = utl.getPureFn('rtFormats::isMinutes') as SegmentFn;
  return function _is_hhmm(value: string): boolean {
    const parts = value.split(':');
    return parts.length === 2 && isH(parts[0]) && isM(parts[1]);
  };
});

registerPureFnFactory('rtFormats::isTimeString_mmss', function (utl: RTUtils) {
  const isM = utl.getPureFn('rtFormats::isMinutes') as SegmentFn;
  const isS = utl.getPureFn('rtFormats::isSeconds') as SegmentFn;
  return function _is_mmss(value: string): boolean {
    const parts = value.split(':');
    return parts.length === 2 && isM(parts[0]) && isS(parts[1]);
  };
});

// ############### Bound comparison pure fns ###############
//
// These convert a validated value (or a relative `now±P…` spec) to a
// numeric comparison key. The Go emitter bakes absolute bounds as
// precomputed numbers on the SAME scale, so a min/max check is a plain
// `key(value) >= bakedMin` / `<= relativeNowKey(spec)`.
//
// Scales (must match internal/cachegen/typefunctions/formats/datetime/literals.go):
//   - date / dateTime / native Date → epoch milliseconds (UTC)
//   - time                          → milliseconds-of-day
// Canonical fills for partial layouts: missing year → 2000, missing day → 1.
// (The fill year is inlined inside each factory — pure-fn factories can't
// capture outer-scope bindings.)

// dateStrToMs — UTC epoch ms for a date value already known to be valid
// in `layout`. `layout` is one of the DateFmt strings.
registerPureFnFactory('rtFormats::dateStrToMs', function () {
  return function _date_to_ms(value: string, layout: string): number {
    const parts = value.split('-');
    // Canonical fill for yearless layouts (MM-DD / DD-MM): a fixed year is
    // required to build a comparable epoch, and it MUST match Go's
    // defaultFillYear in literals.go. 2000 is chosen as a leap year so
    // '02-29' is representable. (Literal, not an outer const — pure-fn
    // factories can't capture outer-scope bindings.)
    let year = 2000;
    let month = 1;
    let day = 1;
    switch (layout) {
      case 'ISO':
      case 'YYYY-MM-DD':
        year = Number(parts[0]);
        month = Number(parts[1]);
        day = Number(parts[2]);
        break;
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
    }
    return Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  };
});

// timeStrToMs — ms-of-day for a time value valid in `layout`. The tz
// (when present) is stripped and ignored (wall-clock comparison).
registerPureFnFactory('rtFormats::timeStrToMs', function () {
  return function _time_to_ms(value: string, layout: string): number {
    let body = value;
    if (layout === 'ISO' || layout === 'HH:mm:ss[.mmm]TZ') {
      if (body.endsWith('Z') || body.endsWith('z')) {
        body = body.substring(0, body.length - 1);
      } else {
        const plus = body.indexOf('+');
        const minus = body.lastIndexOf('-');
        const cut = plus !== -1 ? plus : minus;
        if (cut > 0) body = body.substring(0, cut);
      }
    }
    let hours = 0;
    let mins = 0;
    let secMs = 0;
    if (layout === 'HH') return Number(body) * 3600000;
    if (layout === 'mm') return Number(body) * 60000;
    if (layout === 'ss') return Number(body) * 1000;
    const parts = body.split(':');
    if (layout === 'HH:mm') {
      hours = Number(parts[0]);
      mins = Number(parts[1]);
    } else if (layout === 'mm:ss') {
      mins = Number(parts[0]);
      secMs = Number(parts[1]) * 1000;
    } else {
      // HH:mm:ss, HH:mm:ss[.mmm], ISO — up to three segments. A dateTime
      // bound parses its time half as 'ISO' regardless of the declared
      // nested layout, so the value may legitimately carry fewer segments
      // (e.g. an 'HH:mm' nested time → '14:30'). The structural check has
      // already validated the value against its real layout; here we only
      // need a tolerant key, so absent segments contribute 0.
      hours = Number(parts[0]);
      mins = parts[1] ? Number(parts[1]) : 0;
      if (parts[2]) {
        const secParts = parts[2].split('.');
        secMs = Number(secParts[0]) * 1000 + (secParts[1] ? Number(secParts[1]) : 0);
      }
    }
    return hours * 3600000 + mins * 60000 + secMs;
  };
});

// relativeNowKey — evaluates a `now`, `now+P…`, or `now-P…` spec to a
// comparison key on the requested scale. scale: 'epoch' → UTC epoch ms
// (calendar-correct add via Date arithmetic); 'timeOfDay' → ms-of-day
// (only T-section components apply; date components are rejected
// build-time so won't appear here).
registerPureFnFactory('rtFormats::relativeNowKey', function () {
  // Parse the ISO-8601 duration tail into {years, months, weeks, days,
  // hours, minutes, seconds}. Returns null for bare `now`.
  function parseDuration(tail: string): Record<string, number> {
    const out: Record<string, number> = {years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0};
    const body = tail.substring(1); // drop leading 'P'
    const tIdx = body.indexOf('T');
    const datePart = tIdx === -1 ? body : body.substring(0, tIdx);
    const timePart = tIdx === -1 ? '' : body.substring(tIdx + 1);
    const eat = (segment: string, map: Record<string, string>) => {
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
  return function _relative_now_key(spec: string, scale: string): number {
    const now = new Date();
    if (scale === 'timeOfDay') {
      let ms = now.getUTCHours() * 3600000 + now.getUTCMinutes() * 60000 + now.getUTCSeconds() * 1000 + now.getUTCMilliseconds();
      if (spec !== 'now') {
        const sign = spec[3] === '-' ? -1 : 1;
        const d = parseDuration(spec.substring(4));
        ms += sign * (d.hours * 3600000 + d.minutes * 60000 + d.seconds * 1000);
      }
      return ms;
    }
    const result = new Date(now.getTime());
    if (spec !== 'now') {
      const sign = spec[3] === '-' ? -1 : 1;
      const d = parseDuration(spec.substring(4));
      // Calendar-correct: apply Y/M via setUTCMonth (handles month length),
      // then W/D and time components as fixed offsets.
      result.setUTCFullYear(result.getUTCFullYear() + sign * d.years);
      result.setUTCMonth(result.getUTCMonth() + sign * d.months);
      result.setUTCDate(result.getUTCDate() + sign * (d.weeks * 7 + d.days));
      result.setTime(result.getTime() + sign * (d.hours * 3600000 + d.minutes * 60000 + d.seconds * 1000));
    }
    if (scale === 'epochDate') {
      // Floor to UTC midnight so the bound is on the same scale as
      // dateStrToMs (which builds dates at 00:00:00Z).
      return Date.UTC(result.getUTCFullYear(), result.getUTCMonth(), result.getUTCDate(), 0, 0, 0, 0);
    }
    return result.getTime();
  };
});
