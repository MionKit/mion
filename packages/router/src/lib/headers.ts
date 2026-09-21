/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MionHeaders} from '../types/context.ts';

// ############# PUBLIC METHODS #############

type HeadersRecord = Record<string, string>;

const PROTO_KEY = '__proto__';

/** Case-insensitive HTTP headers, like the fetch Headers API but optimized for performance.
 *  https://developer.mozilla.org/en-US/docs/Web/API/Headers */
class MionHeadersImpl implements MionHeaders {
  // The record may be a plain object handed over by the platform (node's IncomingMessage.headers is one),
  // where `constructor` or `toString` would be "found" on the prototype chain. A prototype hit is never a
  // string, so a read checks the VALUE's type: cheaper than an own-key check per read (14 vs 23 ns).
  // `__proto__` is never written: on a plain object that assignment swaps the prototype.
  constructor(private headers: HeadersRecord) {}

  append(name: string, value: string): void {
    const nl = name.toLowerCase();
    if (nl === PROTO_KEY) return;
    const existing = readHeader(this.headers, nl);
    const headerValue = toSingleHeader(value);
    if (existing) {
      this.headers[nl] = `${existing}, ${headerValue}`;
    } else {
      this.headers[nl] = headerValue;
    }
  }

  delete(name: string): void {
    delete this.headers[name.toLowerCase()];
  }

  get(name: string): string | undefined | null {
    return readHeader(this.headers, name.toLowerCase());
  }

  set(name: string, value: string): void {
    const ln = name.toLowerCase();
    if (ln === PROTO_KEY) return;
    this.headers[ln] = value as string;
  }

  has(name: string): boolean {
    return !!readHeader(this.headers, name.toLowerCase());
  }

  entries(): IterableIterator<[string, string]> {
    return new Map(Object.entries(this.headers)).entries();
  }

  keys(): IterableIterator<string> {
    return new Map(Object.entries(this.headers)).keys();
  }

  values(): IterableIterator<string> {
    return new Map(Object.entries(this.headers)).values();
  }
}

/** A fetch-like (not identical) Headers object over a header record, for an incoming request carrying its
 *  headers as an object: IncomingMessage.headers, ApiGatewayEvent.headers.
 *  https://developer.mozilla.org/en-US/docs/Web/API/Headers */
export function headersFromRecord(headersObj: Record<string, string>, skipToLower = false): MionHeaders {
  const headers = parseHeaders(headersObj, skipToLower);
  return new MionHeadersImpl(headers);
}

/** A header value, or undefined for a name the record does not carry as an own string (a prototype
 *  hit is a function or an object). A platform record may hold an array (node's `set-cookie`). */
function readHeader(headers: HeadersRecord, lowerName: string): string | undefined {
  const value = headers[lowerName] as unknown;
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? value.join(', ') : undefined;
}

function toSingleHeader(value: string | number): string {
  if (Array.isArray(value)) return value.join(', ');
  return value as string;
}

function parseHeaders(headersObj: Record<string, string>, skipToLower = false): HeadersRecord {
  if (skipToLower) return headersObj;
  const entries = Object.entries(headersObj);
  // null-prototype: header names come off the wire
  const headers: HeadersRecord = Object.create(null);
  for (let i = 0; i < entries.length; i++) {
    const [name, value] = entries[i];
    if (!value) continue;
    const ln = name.toLowerCase();
    headers[ln] = toSingleHeader(value);
  }
  return headers;
}
