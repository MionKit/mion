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

// ############### IP pure fns ###############
//
// isIPV4 / isIPV6 accept a params object carrying the version (for the
// localhost check), allowLocalHost, and allowPort flags. Both delegate
// the loopback test to isLocalHost.

interface IPParams {
  version: 4 | 6 | 'any';
  allowLocalHost?: boolean;
  allowPort?: boolean;
}

type IsIpFn = (ip: string, params: IPParams) => boolean;

registerPureFnFactory('rtFormats::isLocalHost', function () {
  const lhr = /^localhost$/i;
  return function _is_local_host(ip: string, params: IPParams): boolean {
    if (params.version === 4) return lhr.test(ip) || ip === '127:0:0:1';
    if (params.version === 6) return ip === '::1' || ip === '0:0:0:0:0:0:0:1';
    return lhr.test(ip) || ip === '127:0:0:1' || ip === '::1' || ip === '0:0:0:0:0:0:0:1';
  };
});

registerPureFnFactory('rtFormats::isIPV4', function (utl: RTUtils) {
  const isLocalHost = utl.getPureFn('rtFormats::isLocalHost') as IsIpFn;
  function getAddress(ip: string, params: IPParams): false | string {
    if (!params.allowPort) return ip;
    const parts = ip.split(':');
    if (parts.length > 2) return false;
    const [address, portS] = parts;
    if (!portS) return address;
    const port = Number(portS);
    if (isNaN(port) || port < 0 || port > 65535) return false;
    return address;
  }
  return function _is_ip_v4(ip: string, params: IPParams): boolean {
    const address = getAddress(ip, params);
    if (address === false) return false;
    const isLocal = isLocalHost(address, params);
    if (params.allowLocalHost && isLocal) return true;
    if (!params.allowLocalHost && isLocal) return false;
    const sections = address.split('.');
    if (sections.length !== 4) return false;
    for (const section of sections) {
      const num = Number(section);
      if (isNaN(num) || num < 0 || num > 255) return false;
    }
    return true;
  };
});

registerPureFnFactory('rtFormats::isIPV6', function (utl: RTUtils) {
  const isLocalHost = utl.getPureFn('rtFormats::isLocalHost') as IsIpFn;
  const ipv6PortRegexp = /^\[([^\]]+)\](?::(\d+))?$/;
  function getAddress(ip: string, params: IPParams): false | string {
    if (!params.allowPort) return ip;
    const match = ip.match(ipv6PortRegexp);
    if (!match) return false;
    const address = match[1];
    const port = match[2];
    if (!port) return address;
    const num = Number(port);
    if (isNaN(num) || num < 0 || num > 65535) return false;
    return address;
  }
  return function _is_ip_v6(ip: string, params: IPParams): boolean {
    const address = getAddress(ip, params);
    if (address === false) return false;
    const isLocal = isLocalHost(address, params);
    if (params.allowLocalHost && isLocal) return true;
    if (!params.allowLocalHost && isLocal) return false;
    const sections = address.split(':');
    if (sections.length < 3 || sections.length > 8) return false;
    let doubleColon = 0;
    for (const section of sections) {
      if (section.length === 0) {
        doubleColon++;
        if (doubleColon > 1) return false;
        continue;
      }
      if (section.length > 4) return false;
      const num = parseInt(section, 16);
      if (isNaN(num) || num < 0 || num > 0xffff) return false;
    }
    return true;
  };
});
