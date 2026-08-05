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
