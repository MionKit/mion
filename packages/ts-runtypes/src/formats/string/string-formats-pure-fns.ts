// Registration module for every pure fn the Go-side format emitters
// reach via `utl.getPureFn('rtFormats::<name>')`. Each pf_* below
// is registered at module load; importing this file from
// `src/formats/index.ts` (the `ts-runtypes/formats`
// subpath surface) is enough to guarantee the registrations happen
// before any user code references a format type.
//
// Mirrors (ref: packages/type-formats/src/type-formats-pure-fns.ts)
// minus the deepkit-coupled `getPureFn` typing — our utl is the
// runtime helper exported from ts-runtypes.
//
// Phase 3 ships pf_isUUID. Subsequent phases append more.

import {registerPureFnFactory} from '../../runtypes/pureFn.ts';
import type {RTUtils} from '../../runtypes/rtUtils.ts';

// UUIDParams — the wire-shape params object the Go emitter
// passes to pf_isUUID at runtime. Mirrors the UUIDParams
// keeping only what the validator needs.
interface UUIDParams {
  version: string;
}

// pf_isUUID — port of the same-named pure fn. Length + dash
// positions + version digit at slot 14 + hex character class on
// every other slot. Matches the runtime behaviour of the canonical
// UUIDv4 / UUIDv7 patterns without pulling in a regex engine.
registerPureFnFactory('rtFormats::isUUID', function () {
  return function _isUUID(value: string, params: UUIDParams): boolean {
    if (typeof value !== 'string' || value.length !== 36) return false;
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        if (value[i] !== '-') return false;
      } else if (i === 14 && params.version !== 'any') {
        // Version-pinned formats check the version digit; the
        // version-agnostic UUID ('any' — JSON Schema `format: uuid`)
        // treats slot 14 as an ordinary hex digit below.
        if (value[i] !== params.version) return false;
      } else {
        const charCode = value.charCodeAt(i);
        const is09 = charCode >= 48 && charCode <= 57;
        const isaf = charCode >= 97 && charCode <= 102;
        const isAF = charCode >= 65 && charCode <= 70;
        if (!(is09 || isaf || isAF)) return false;
      }
    }
    return true;
  };
});

// ############### Length pure fn ###############
//
// `minLength` / `maxLength` / `length` count CODE POINTS, not UTF-16 code
// units, which is what JSON Schema specifies and what a reader means by "two
// characters": `'💩💩'` is two code points but `.length === 4`, so a plain
// `.length` check calls it too long under `maxLength: 2`. Only the ambiguous
// side of each bound routes through here (see lengthConditions in
// internal/cachegen/typefunctions/formats/string/stringformat.go), and the
// surrogate pre-test keeps the all-BMP case a single native scan with no
// per-character loop.
registerPureFnFactory('rtFormats::codePointLength', function () {
  const highSurrogateRegexp = /[\uD800-\uDBFF]/;
  return function _code_point_length(value: string): number {
    if (!highSurrogateRegexp.test(value)) return value.length;
    let count = 0;
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) i++;
      count++;
    }
    return count;
  };
});

// ############### Regex pure fn ###############
//
// `format: 'regex'` asks whether the STRING is a usable ECMA-262 regular
// expression, which is not a shape question — the only honest test is handing
// it to the engine. Unicode mode is what rejects the constructs from other
// regex dialects that plain mode would quietly accept as literals: the inline
// flag groups `(?i)` / `(?ims)`, the comment group `(?#…)`, and Python's named
// group and backreference spellings.
registerPureFnFactory('rtFormats::isEcmaRegex', function () {
  return function _is_ecma_regex(value: string): boolean {
    try {
      new RegExp(value, 'u');
      return true;
    } catch {
      return false;
    }
  };
});

// ############### IDNA pure fns ###############
//
// The internationalized host name engine, split the way the date/time fns are:
// small pieces that reach each other through `utl.getPureFn` so the Go
// extractor records the transitive deps and ships only what a call site needs.
//
//   punycodeDecode / punycodeEncode  RFC 3492, the `xn--` payload codec
//   isIdnaLabel                      RFC 5892, one label's characters + context
//   satisfiesBidi                    RFC 5893, the whole-name ordering rule
//   isIdnHostname                    the entry point the `domain` emitter calls
//
// A host name cannot be a pattern: an `xn--` label has to be DECODED before its
// characters can be judged, re-encoded to prove the spelling is canonical, and
// the Bidi rule reads every label at once. Each factory keeps its own tables
// inline because the extractor lifts the factory body alone.

type PunycodeFn = (input: string) => string | false;
type LabelFn = (label: string) => boolean;
type BidiFn = (labels: readonly string[]) => boolean;

registerPureFnFactory('rtFormats::punycodeDecode', function () {
  const BASE = 36;
  const TMIN = 1;
  const TMAX = 26;
  const SKEW = 38;
  const DAMP = 700;
  const INITIAL_BIAS = 72;
  const INITIAL_N = 128;
  const MAX_INT = 0x7fffffff;
  function adapt(delta: number, numPoints: number, firstTime: boolean): number {
    let scaled = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
    scaled += Math.floor(scaled / numPoints);
    let k = 0;
    while (scaled > ((BASE - TMIN) * TMAX) >> 1) {
      scaled = Math.floor(scaled / (BASE - TMIN));
      k += BASE;
    }
    return k + Math.floor(((BASE - TMIN + 1) * scaled) / (scaled + SKEW));
  }
  return function _punycode_decode(input: string): string | false {
    const out: number[] = [];
    let index = input.lastIndexOf('-');
    if (index > 0) {
      for (let i = 0; i < index; i++) {
        const code = input.charCodeAt(i);
        if (code >= 0x80) return false;
        out.push(code);
      }
      index++;
    } else index = 0;
    let n = INITIAL_N;
    let bias = INITIAL_BIAS;
    let i = 0;
    while (index < input.length) {
      const previousI = i;
      for (let weight = 1, k = BASE; ; k += BASE) {
        if (index >= input.length) return false;
        const code = input.charCodeAt(index++);
        const digit =
          code >= 0x30 && code <= 0x39
            ? code - 0x30 + 26
            : code >= 0x61 && code <= 0x7a
              ? code - 0x61
              : code >= 0x41 && code <= 0x5a
                ? code - 0x41
                : -1;
        if (digit < 0 || digit > (MAX_INT - i) / weight) return false;
        i += digit * weight;
        const threshold = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
        if (digit < threshold) break;
        if (weight > Math.floor(MAX_INT / (BASE - threshold))) return false;
        weight *= BASE - threshold;
      }
      bias = adapt(i - previousI, out.length + 1, previousI === 0);
      if (Math.floor(i / (out.length + 1)) > MAX_INT - n) return false;
      n += Math.floor(i / (out.length + 1));
      i %= out.length + 1;
      if (n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return false;
      out.splice(i++, 0, n);
    }
    return String.fromCodePoint(...out);
  };
});

registerPureFnFactory('rtFormats::punycodeEncode', function () {
  const BASE = 36;
  const TMIN = 1;
  const TMAX = 26;
  const SKEW = 38;
  const DAMP = 700;
  const INITIAL_BIAS = 72;
  const INITIAL_N = 128;
  const MAX_INT = 0x7fffffff;
  function adapt(delta: number, numPoints: number, firstTime: boolean): number {
    let scaled = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
    scaled += Math.floor(scaled / numPoints);
    let k = 0;
    while (scaled > ((BASE - TMIN) * TMAX) >> 1) {
      scaled = Math.floor(scaled / (BASE - TMIN));
      k += BASE;
    }
    return k + Math.floor(((BASE - TMIN + 1) * scaled) / (scaled + SKEW));
  }
  function digitChar(digit: number): string {
    return String.fromCharCode(digit < 26 ? digit + 0x61 : digit - 26 + 0x30);
  }
  return function _punycode_encode(input: string): string | false {
    const points = [...input].map((char) => char.codePointAt(0) as number);
    const basic = points.filter((code) => code < 0x80);
    let handled = basic.length;
    let out = basic.map((code) => String.fromCharCode(code)).join('');
    if (handled) out += '-';
    let n = INITIAL_N;
    let delta = 0;
    let bias = INITIAL_BIAS;
    while (handled < points.length) {
      let next = MAX_INT;
      for (const code of points) if (code >= n && code < next) next = code;
      if (next - n > Math.floor((MAX_INT - delta) / (handled + 1))) return false;
      delta += (next - n) * (handled + 1);
      n = next;
      for (const code of points) {
        if (code < n && ++delta > MAX_INT) return false;
        if (code !== n) continue;
        let remaining = delta;
        for (let k = BASE; ; k += BASE) {
          const threshold = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
          if (remaining < threshold) break;
          out += digitChar(threshold + ((remaining - threshold) % (BASE - threshold)));
          remaining = Math.floor((remaining - threshold) / (BASE - threshold));
        }
        out += digitChar(remaining);
        bias = adapt(delta, handled + 1, handled === basic.length);
        delta = 0;
        handled++;
      }
      delta++;
      n++;
    }
    return out;
  };
});

registerPureFnFactory('rtFormats::isIdnaLabel', function () {
  // RFC 5892 section 2.6 exception tables — short, fixed, and derivable from no
  // Unicode property, so they are spelled out.
  const PVALID_EXCEPTIONS = [0x00df, 0x03c2, 0x06fd, 0x06fe, 0x0f0b, 0x3007];
  const DISALLOWED_EXCEPTIONS = [0x0640, 0x07fa, 0x302e, 0x302f, 0x3031, 0x3032, 0x3033, 0x3034, 0x3035, 0x303b];
  // Canonical_Combining_Class=Virama. JS regex has no escape for it.
  const VIRAMA = [
    0x094d, 0x09cd, 0x0a4d, 0x0acd, 0x0b4d, 0x0bcd, 0x0c4d, 0x0ccd, 0x0d3b, 0x0d3c, 0x0d4d, 0x0dca, 0x0e3a, 0x0eba, 0x0f84,
    0x1039, 0x103a, 0x1714, 0x1734, 0x17d2, 0x1a60, 0x1b44, 0x1baa, 0x1bab, 0x1bf2, 0x1bf3, 0x2d7f, 0xa806, 0xa8c4, 0xa953,
    0xa9c0, 0xaaf6, 0xabed, 0x10a3f, 0x11046, 0x1107f, 0x110b9, 0x11133, 0x11134, 0x111c0, 0x11235, 0x112ea, 0x1134d, 0x11442,
    0x114c2, 0x115bf, 0x1163f, 0x116b6, 0x1172b, 0x11839, 0x119e0, 0x11a34, 0x11a99, 0x11c3f, 0x11d44, 0x11d45, 0x11d97,
  ];
  const greekRegexp = /\p{Script=Greek}/u;
  const hebrewRegexp = /\p{Script=Hebrew}/u;
  const katakanaContextRegexp = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
  const allowedRegexp = /[\p{L}\p{M}\p{N}]/u;
  const markRegexp = /\p{M}/u;
  const arabicIndicRegexp = /[٠-٩]/u;
  const extendedArabicIndicRegexp = /[۰-۹]/u;
  // Joining_Type is not a JS regex property either, so the joining SCRIPTS
  // stand in for it — enough to tell an Arabic neighbour from a Latin one.
  const joiningRegexp = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mandaic}\p{Script=Adlam}]\p{M}*$/u;
  return function _is_idna_label(label: string): boolean {
    if (label === '') return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
    // `--` in the 3rd and 4th position is reserved for the A-label prefix.
    if (label.length > 3 && label[2] === '-' && label[3] === '-') return false;
    const chars = [...label];
    if (markRegexp.test(chars[0])) return false;
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const code = char.codePointAt(0) as number;
      if (DISALLOWED_EXCEPTIONS.indexOf(code) !== -1) return false;
      if (PVALID_EXCEPTIONS.indexOf(code) !== -1) continue;
      if (char === '-') continue;
      if (code === 0x200c || code === 0x200d) {
        // CONTEXTJ: a joiner is allowed directly after a Virama, and ZWNJ also
        // between joining letters (RFC 5892 A.1 rule 2).
        if (i === 0) return false;
        if (VIRAMA.indexOf(chars[i - 1].codePointAt(0) as number) !== -1) continue;
        if (code !== 0x200c) return false;
        if (!joiningRegexp.test(chars.slice(0, i).join(''))) return false;
        continue;
      }
      // CONTEXTO, one rule per character, each decided by its neighbours.
      if (code === 0x00b7) {
        if (chars[i - 1] !== 'l' || chars[i + 1] !== 'l') return false;
        continue;
      }
      if (code === 0x0375) {
        if (!chars[i + 1] || !greekRegexp.test(chars[i + 1])) return false;
        continue;
      }
      if (code === 0x05f3 || code === 0x05f4) {
        if (!chars[i - 1] || !hebrewRegexp.test(chars[i - 1])) return false;
        continue;
      }
      if (code === 0x30fb) {
        if (!katakanaContextRegexp.test(label)) return false;
        continue;
      }
      if (arabicIndicRegexp.test(char)) {
        if (extendedArabicIndicRegexp.test(label)) return false;
        continue;
      }
      if (extendedArabicIndicRegexp.test(char)) {
        if (arabicIndicRegexp.test(label)) return false;
        continue;
      }
      if (!allowedRegexp.test(char)) return false;
    }
    return true;
  };
});

registerPureFnFactory('rtFormats::satisfiesBidi', function () {
  const rtlRegexp =
    /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}]/u;
  const letterRegexp = /\p{L}/u;
  const arabicNumberRegexp = /[٠-٩٫٬]/u;
  const europeanNumberRegexp = /[0-9۰-۹]/u;
  return function _satisfies_bidi(labels: readonly string[]): boolean {
    // A right-to-left LETTER is what makes the whole name a Bidi domain; a
    // digit or sign that merely lives in an RTL script does not.
    const isRtlLetter = (char: string) => rtlRegexp.test(char) && letterRegexp.test(char);
    if (!labels.some((label) => [...label].some(isRtlLetter))) return true;
    for (const label of labels) {
      const chars = [...label];
      if (!letterRegexp.test(chars[0])) return false;
      if (isRtlLetter(chars[0])) {
        // An RTL label may carry European OR Arabic-Indic digits, never both.
        if (arabicNumberRegexp.test(label) && europeanNumberRegexp.test(label)) return false;
      } else if (chars.some(isRtlLetter)) {
        return false;
      }
    }
    return true;
  };
});

registerPureFnFactory('rtFormats::isIdnHostname', function (utl: RTUtils) {
  const punycodeDecode = utl.getPureFn('rtFormats::punycodeDecode') as PunycodeFn;
  const punycodeEncode = utl.getPureFn('rtFormats::punycodeEncode') as PunycodeFn;
  const isIdnaLabel = utl.getPureFn('rtFormats::isIdnaLabel') as LabelFn;
  const satisfiesBidi = utl.getPureFn('rtFormats::satisfiesBidi') as BidiFn;
  // The wide stops are label separators for an internationalized name only.
  const idnSeparatorRegexp = /[.。．｡]/;
  const asciiSeparatorRegexp = /[.]/;
  const asciiLabelRegexp = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
  // Matched positively rather than as a negated ASCII range: naming the
  // control characters in a regex trips oxlint no-control-regex, and asking
  // "is there a character above ASCII" says the same thing.
  const nonAsciiRegexp = /[\u0080-\u{10FFFF}]/u;
  return function _is_idn_hostname(value: string, params: {idn?: boolean}): boolean {
    if (value === '' || value.length > 253) return false;
    const labels = value.split(params.idn ? idnSeparatorRegexp : asciiSeparatorRegexp);
    const decoded: string[] = [];
    for (const label of labels) {
      if (label === '') return false;
      if (label.length > 3 && label.slice(0, 4).toLowerCase() === 'xn--') {
        if (label.length > 63) return false;
        const payload = punycodeDecode(label.slice(4));
        // An A-label must decode, must not decode to something already ASCII,
        // must be the canonical encoding of what it decodes to, and what it
        // decodes to must itself be a valid label.
        if (payload === false || payload === '') return false;
        if (!nonAsciiRegexp.test(payload)) return false;
        if (punycodeEncode(payload) !== label.slice(4).toLowerCase()) return false;
        if (!isIdnaLabel(payload)) return false;
        decoded.push(payload);
        continue;
      }
      if (asciiLabelRegexp.test(label)) {
        decoded.push(label);
        continue;
      }
      if (!params.idn) return false;
      if (!isIdnaLabel(label)) return false;
      // The 63-octet limit applies to the ENCODED form, so encode to measure.
      const encoded = punycodeEncode(label);
      if (encoded === false || encoded.length + 4 > 63) return false;
      decoded.push(label);
    }
    return satisfiesBidi(decoded);
  };
});

// ############### Email pure fn ###############
//
// RFC 5321 addressing, which the EMAIL_PATTERN cannot express: a QUOTED local
// part may carry spaces, dots in a row, even an `@` of its own, and the domain
// may be an address literal (`[127.0.0.1]`, `[IPv6:::1]`) instead of a name.
// Composed from the engines already registered above — the IP checks for the
// literals, the host-name engine for the ordinary domain — so the rules live in
// one place each.
registerPureFnFactory('rtFormats::isEmailAddress', function (utl: RTUtils) {
  const isIPV4 = utl.getPureFn('rtFormats::isIPV4') as (ip: string, params: object) => boolean;
  const isIPV6 = utl.getPureFn('rtFormats::isIPV6') as (ip: string, params: object) => boolean;
  const isIdnHostname = utl.getPureFn('rtFormats::isIdnHostname') as (value: string, params: object) => boolean;
  const asciiAtextRegexp = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+$/;
  // The internationalized local part widens the repertoire rather than listing
  // it: anything that is not a separator, a space, or a bracket.
  const idnAtextRegexp = /^[^ \t\r\n@.[\]]+$/u;
  const bareQuoteRegexp = /(^|[^\\])"/;
  function isQuoted(local: string): boolean {
    if (local.length < 2 || local[0] !== '"' || local[local.length - 1] !== '"') return false;
    // A bare quote inside would have ended the string early.
    return !bareQuoteRegexp.test(local.substring(1, local.length - 1));
  }
  function isLocalPart(local: string, idn: boolean): boolean {
    if (local === '') return false;
    if (isQuoted(local)) return true;
    const atextRegexp = idn ? idnAtextRegexp : asciiAtextRegexp;
    const parts = local.split('.');
    // A dot separates atoms, so it may not lead, trail, or repeat.
    for (const part of parts) if (part === '' || !atextRegexp.test(part)) return false;
    return true;
  }
  return function _is_email_address(value: string, params: {idn?: boolean}): boolean {
    // The LAST '@' separates: a quoted local part may contain one of its own.
    const at = value.lastIndexOf('@');
    if (at <= 0 || at === value.length - 1) return false;
    if (!isLocalPart(value.substring(0, at), params.idn === true)) return false;
    const domain = value.substring(at + 1);
    if (domain[0] === '[' && domain[domain.length - 1] === ']') {
      const literal = domain.substring(1, domain.length - 1);
      if (literal.substring(0, 5) === 'IPv6:') {
        return isIPV6(literal.substring(5), {version: 6, allowLocalHost: true});
      }
      return isIPV4(literal, {version: 4, allowLocalHost: false});
    }
    return isIdnHostname(domain, {idn: params.idn === true});
  };
});

// ############### IP pure fns ###############
//
// isIPV4 / isIPV6 accept a params object carrying the version, allowLocalHost,
// and allowPort flags. Both delegate the hostname test to isLocalHost.

interface IPParams {
  version: 4 | 6 | 'any';
  allowLocalHost?: boolean;
  allowPort?: boolean;
}

type IsLocalHostFn = (ip: string) => boolean;

// The HOSTNAME spelling only, and off by default: `allowLocalHost` widens an IP
// format to also accept the word "localhost", which suits a config field that
// takes either but is not an address. The loopback ADDRESSES (`127.0.0.1`,
// `::1`, `0:0:0:0:0:0:0:1`) are ordinary well-formed addresses that the version
// parsers accept on their own — gating those behind the flag would reject a
// perfectly good `::1` from anyone who turned it off.
registerPureFnFactory('rtFormats::isLocalHost', function () {
  const localHostRegexp = /^localhost$/i;
  return function _is_local_host(ip: string): boolean {
    return localHostRegexp.test(ip);
  };
});

registerPureFnFactory('rtFormats::isIPV4', function (utl: RTUtils) {
  const isLocalHost = utl.getPureFn('rtFormats::isLocalHost') as IsLocalHostFn;
  // Dotted quad, ASCII digits only. Anchored + `Number`-free on purpose:
  // `Number('')` is 0, `Number('0x7f')` is 127 and `Number(' 1\n')` is 1, so a
  // coercion-based octet check silently accepts `192.168..1`, `0x7f.0.0.1` and
  // trailing whitespace / newlines. `\d` stays ASCII under every flag, which is
  // what keeps full-width and Bengali digits out.
  const ipv4Regexp = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  function getAddress(ip: string, params: IPParams): false | string {
    if (!params.allowPort) return ip;
    const parts = ip.split(':');
    if (parts.length > 2) return false;
    const [address, portS] = parts;
    if (!portS) return address;
    if (!/^\d{1,5}$/.test(portS) || Number(portS) > 65535) return false;
    return address;
  }
  return function _is_ip_v4(ip: string, params: IPParams): boolean {
    const address = getAddress(ip, params);
    if (address === false) return false;
    if (isLocalHost(address)) return params.allowLocalHost === true;
    return ipv4Regexp.test(address);
  };
});

registerPureFnFactory('rtFormats::isIPV6', function (utl: RTUtils) {
  const isLocalHost = utl.getPureFn('rtFormats::isLocalHost') as IsLocalHostFn;
  const ipv6PortRegexp = /^\[([^\]]+)\](?::(\d+))?$/;
  const hexGroupRegexp = /^[0-9a-fA-F]{1,4}$/;
  const ipv4TailRegexp = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  function getAddress(ip: string, params: IPParams): false | string {
    if (!params.allowPort) return ip;
    const match = ip.match(ipv6PortRegexp);
    if (!match) return false;
    const address = match[1];
    const port = match[2];
    if (!port) return address;
    if (Number(port) > 65535) return false;
    return address;
  }
  // Counts the 16-bit groups written in one `:`-separated run, or -1 when any
  // group is malformed. A dotted quad is accepted in the LAST position only
  // (the ipv4-mapped form) and counts as the two groups it encodes.
  function countGroups(run: string, allowIPv4Tail: boolean): number {
    if (run === '') return 0;
    const groups = run.split(':');
    let count = 0;
    for (let i = 0; i < groups.length; i++) {
      if (allowIPv4Tail && i === groups.length - 1 && ipv4TailRegexp.test(groups[i])) {
        count += 2;
        continue;
      }
      if (!hexGroupRegexp.test(groups[i])) return -1;
      count++;
    }
    return count;
  }
  return function _is_ip_v6(ip: string, params: IPParams): boolean {
    const address = getAddress(ip, params);
    if (address === false) return false;
    if (isLocalHost(address)) return params.allowLocalHost === true;
    // `::` elides one or more all-zero groups and may appear at most once; a
    // lone leading / trailing `:` is not an elision, so those runs come back
    // with an empty group and are rejected.
    const elision = address.indexOf('::');
    if (elision !== address.lastIndexOf('::')) return false;
    if (elision === -1) return countGroups(address, true) === 8;
    const head = countGroups(address.slice(0, elision), false);
    const tail = countGroups(address.slice(elision + 2), true);
    if (head === -1 || tail === -1) return false;
    // The elision stands for at least one group, so the written ones must leave
    // room for it.
    return head + tail <= 7;
  };
});
