// Registration module for every pure fn the Go-side format emitters
// reach via `utl.getPureFn('rtFormats::<name>')`. Each pf_* below
// is registered at module load; importing this file from
// `src/formats/index.ts` (the `ts-runtypes/formats`
// subpath surface) is enough to guarantee the registrations happen
// before any user code references a format type.
//
// Mirrors (ref: packages/type-formats/src/type-formats-pure-fns.ts)
// minus the deepkit-coupled `getPureFn` typing — our utl is the
// runtime helper exported from @mionjs/run-types.
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
// internal/cachegen/typefunctions/formats/string/stringformat.go — bounds a
// plain `.length` already decides never reach this fn). Two regimes: a short
// string counts faster in a plain charCode loop than the fixed cost of a
// regex call, a long all-BMP one is a single native regex scan (measured
// crossover sits well above the 24 cutoff either way).
registerPureFnFactory('rtFormats::codePointLength', function () {
  const highSurrogateRegexp = /[\uD800-\uDBFF]/;
  return function _code_point_length(value: string): number {
    const len = value.length;
    if (len > 24 && !highSurrogateRegexp.test(value)) return len;
    let count = len;
    for (let i = 0; i < len; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < len) {
        i++;
        count--;
      }
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
//
// ONE deliberate departure from the RFC's letter: a NAMED domain must be
// dotted. RFC 5321 permits `joe@tld`, but the practical default everywhere
// else — our own `Email` pattern, AJV with `mode: 'full'` — requires the
// dotted TLD, and the two doors to one concept must agree (the decision is
// recorded in docs/done/json-schema-email-format-accepts-tldless-domain.md:
// when a spec's letter and the practical default disagree, the practical
// default wins). Address literals are untouched — brackets, not dots, are
// their shape.
registerPureFnFactory('rtFormats::isEmailAddress', function (utl: RTUtils) {
  const isIPV4 = utl.getPureFn('rtFormats::isIPV4') as (ip: string, params: object) => boolean;
  const isIPV6 = utl.getPureFn('rtFormats::isIPV6') as (ip: string, params: object) => boolean;
  const isIdnHostname = utl.getPureFn('rtFormats::isIdnHostname') as (value: string, params: object) => boolean;
  // Same label separators the host-name engine splits on: '.' for ASCII, plus
  // the wide stops for an internationalized name. (Redeclared here — each
  // factory keeps its own tables, the extractor lifts the body alone.)
  const idnDotRegexp = /[.。．｡]/;
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
    // The dotted-TLD rule (see the factory comment): a bare one-label domain
    // is a valid HOST NAME but not an address's domain.
    if (params.idn === true ? !idnDotRegexp.test(domain) : domain.indexOf('.') === -1) return false;
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
  // Length gate first: this runs on EVERY ip validation, and a case-blind
  // regex call costs more than the answer is worth when the length already
  // says no.
  return function _is_local_host(ip: string): boolean {
    return ip.length === 9 && ip.toLowerCase() === 'localhost';
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
  // The group walkers work on index RANGES of the one address string — a
  // split-and-regex version of the same rules measured ~2x slower, all of it
  // allocation and per-group regex overhead.
  //
  // isIPv4Quad: dotted quad over [start, end) with the octet rules of the
  // ipv4 pattern — 1-3 ASCII digits, value ≤ 255, leading zeros tolerated.
  function isIPv4Quad(s: string, start: number, end: number): boolean {
    let octets = 0;
    let val = 0;
    let digits = 0;
    for (let i = start; i <= end; i++) {
      if (i === end || s.charCodeAt(i) === 46) {
        if (digits === 0) return false;
        octets++;
        if (octets > 4) return false;
        if (i === end) return octets === 4;
        val = 0;
        digits = 0;
        continue;
      }
      const code = s.charCodeAt(i);
      if (code < 48 || code > 57) return false;
      if (digits === 3 || (val = val * 10 + (code - 48)) > 255) return false;
      digits++;
    }
    return false;
  }
  // isHexGroup: one 16-bit group over [start, end) — 1-4 hex digits.
  function isHexGroup(s: string, start: number, end: number): boolean {
    const n = end - start;
    if (n < 1 || n > 4) return false;
    for (let i = start; i < end; i++) {
      const code = s.charCodeAt(i);
      if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 102) || (code >= 65 && code <= 70))) return false;
    }
    return true;
  }
  // Counts the 16-bit groups written in one `:`-separated run [start, end),
  // or -1 when any group is malformed. A dotted quad is accepted in the LAST
  // position only (the ipv4-mapped form) and counts as the two groups it
  // encodes.
  function countGroups(s: string, start: number, end: number, allowIPv4Tail: boolean): number {
    if (start >= end) return 0;
    let count = 0;
    let groupStart = start;
    for (let i = start; i <= end; i++) {
      if (i === end || s.charCodeAt(i) === 58) {
        if (allowIPv4Tail && i === end && isIPv4Quad(s, groupStart, i)) count += 2;
        else if (isHexGroup(s, groupStart, i)) count += 1;
        else return -1;
        groupStart = i + 1;
      }
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
    if (elision === -1) return countGroups(address, 0, address.length, true) === 8;
    if (address.indexOf('::', elision + 1) !== -1) return false;
    const head = countGroups(address, 0, elision, false);
    const tail = countGroups(address, elision + 2, address.length, true);
    if (head === -1 || tail === -1) return false;
    // The elision stands for at least one group, so the written ones must leave
    // room for it.
    return head + tail <= 7;
  };
});

// ############### Credit card pure fns ###############
//
// Split in TWO on purpose, with NO `utl.getPureFn` edge between them: the Go
// emitter references `matchesCardNetwork` only when the format declares
// `networks`, so a bare `CreditCard` never drags the network table into the
// emitted cache. A dependency edge would defeat that — the extractor records
// transitive deps and would ship both bodies to every call site.
//
//   isCreditCard        digits + length + the Luhn checksum
//   matchesCardNetwork  the per-network prefix / length table
//
// The price of the independence is that each strips `separators` itself. That
// is a handful of bytes against a table of every card network.

// CreditCardParams — the wire-shape params object the Go emitter passes at
// runtime. Mirrors CreditCardParams in ./stringFormats.ts, keeping only what
// the validators read.
interface CreditCardParams {
  networks?: readonly string[];
  separators?: string;
}

/** One network's issuing rules: the first-digit RANGES it uses (both bounds of a
 *  range carry the same number of digits) and the card lengths it issues. **/
export interface CardNetworkRule {
  prefixes: readonly (readonly [string, string])[];
  lengths: readonly number[];
}
/** The whole table, keyed by network name. Exported so the mock generator can
 *  type its `getPureFn('rtFormats::cardNetworkRules')` lookup — the VALUE stays
 *  the pure fn's, so there is exactly one copy. **/
export type CardNetworkRules = Readonly<Record<string, CardNetworkRule>>;

// pf_isCreditCard — the base card-number check. A card number is 12 to 19
// digits whose Luhn checksum comes out to a multiple of 10, which is what
// catches a mistyped digit; a plain length + character-class test does not.
//
// Returns the FAILURE MODE rather than a boolean: '' when the value is a good
// card number, 'format' when it is not shaped like one at all, 'checksum' when
// it is but the check digit does not add up. That feeds the `type` field of the
// emitted format error, so a caller can tell "that is not a card number" from
// "check the digits you typed". Validate compares against '' and pays nothing
// for it.
//
// One right-to-left pass does the whole job: Luhn doubles every second digit
// counting back from the check digit, so walking backwards means no reversal
// and no intermediate string, even when separators have to be skipped.
registerPureFnFactory('rtFormats::isCreditCard', function () {
  return function _is_credit_card(value: string, params: CreditCardParams): string {
    if (typeof value !== 'string' || value === '') return 'format';
    const separators = params.separators;
    let sum = 0;
    let count = 0;
    let double = false;
    // A separator only ever sits BETWEEN digits, so the character to the right
    // of the cursor must be a digit whenever a separator is consumed — which
    // rejects a leading / trailing separator and two in a row.
    let expectDigit = true;
    for (let i = value.length - 1; i >= 0; i--) {
      const charCode = value.charCodeAt(i);
      if (charCode >= 48 && charCode <= 57) {
        let digit = charCode - 48;
        if (double) {
          digit *= 2;
          if (digit > 9) digit -= 9;
        }
        sum += digit;
        double = !double;
        count++;
        expectDigit = false;
        continue;
      }
      if (expectDigit) return 'format';
      if (separators === undefined || separators.indexOf(value[i]) === -1) return 'format';
      expectDigit = true;
    }
    if (expectDigit) return 'format';
    if (count < 12 || count > 19) return 'format';
    return sum % 10 === 0 ? '' : 'checksum';
  };
});

// pf_cardNetworkRules — the per-network prefix and length table, its own pure fn
// so the VALIDATOR and the MOCK GENERATOR share one copy. The table is fiddly
// (prefix ranges per network, the lengths each issues) and a mock that drifted
// from the validator would silently generate cards its own format rejects.
//
// It has to be a pure fn rather than a plain module export: factory bodies are
// inlined WITHOUT their lexical environment, so a factory referencing an
// imported const fails the build (PFE9011). A pure fn is the one thing a factory
// can reach out to, via `utl.getPureFn`. The mock is ordinary code and looks it
// up through `getRTUtils()`.
//
// The top level is frozen because two callers now share the object; the
// `readonly` types carry the rest of the intent.
registerPureFnFactory('rtFormats::cardNetworkRules', function () {
  const RULES: CardNetworkRules = {
    visa: {prefixes: [['4', '4']], lengths: [13, 16, 19]},
    mastercard: {
      prefixes: [
        ['51', '55'],
        ['2221', '2720'],
      ],
      lengths: [16],
    },
    amex: {
      prefixes: [
        ['34', '34'],
        ['37', '37'],
      ],
      lengths: [15],
    },
    discover: {
      prefixes: [
        ['6011', '6011'],
        ['644', '649'],
        ['65', '65'],
        ['622126', '622925'],
      ],
      lengths: [16, 19],
    },
    jcb: {prefixes: [['3528', '3589']], lengths: [16, 17, 18, 19]},
    diners: {
      prefixes: [
        ['300', '305'],
        ['3095', '3095'],
        ['36', '36'],
        ['38', '39'],
      ],
      lengths: [14, 15, 16, 17, 18, 19],
    },
    unionpay: {prefixes: [['62', '62']], lengths: [16, 17, 18, 19]},
    maestro: {
      prefixes: [
        ['5018', '5018'],
        ['5020', '5020'],
        ['5038', '5038'],
        ['5893', '5893'],
        ['6304', '6304'],
        ['6759', '6759'],
        ['6761', '6763'],
      ],
      lengths: [12, 13, 14, 15, 16, 17, 18, 19],
    },
  };
  Object.freeze(RULES);
  return function _card_network_rules(): CardNetworkRules {
    return RULES;
  };
});

// pf_matchesCardNetwork — passes when the number belongs to ANY of the declared
// networks. Each rule is a set of first-digit ranges plus the digit counts that
// network issues; both bounds of a range carry the same number of digits, so a
// plain string comparison of the equal-length head decides membership without
// parsing a number.
//
// Runs AFTER isCreditCard in the emitted `&&` chain, so the value is already
// known to be digits (plus separators) of a valid length.
registerPureFnFactory('rtFormats::matchesCardNetwork', function (utl: RTUtils) {
  const NETWORK_RULES = (utl.getPureFn('rtFormats::cardNetworkRules') as () => CardNetworkRules)();
  return function _matches_card_network(value: string, params: CreditCardParams): boolean {
    const networks = params.networks;
    if (networks === undefined || networks.length === 0) return false;
    const separators = params.separators;
    let digits = value;
    if (separators !== undefined) {
      digits = '';
      for (let i = 0; i < value.length; i++) {
        if (separators.indexOf(value[i]) === -1) digits += value[i];
      }
    }
    for (const network of networks) {
      const rule = NETWORK_RULES[network];
      if (rule === undefined) continue;
      if (rule.lengths.indexOf(digits.length) === -1) continue;
      for (const [low, high] of rule.prefixes) {
        const head = digits.slice(0, low.length);
        if (head >= low && head <= high) return true;
      }
    }
    return false;
  };
});
