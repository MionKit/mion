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

/**
 * Reusable class for managing HTTP headers with case-insensitive access
 * Similar to the fetch Headers API but optimized for performance
 * https://developer.mozilla.org/en-US/docs/Web/API/Headers
 */
class MionHeadersImpl implements MionHeaders {
  // The record may be a plain object handed over by the platform (node's IncomingMessage.headers
  // is one), where `constructor` or `toString` would otherwise be "found" on the prototype chain.
  // A prototype hit is a function or an object, never a string, so a read checks the VALUE's type:
  // cheaper than an own-key check on every read (measured 14 vs 23 ns). `__proto__` is never
  // written, since on a plain object that assignment swaps the prototype instead of storing a header.
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

/**
 * Return a Headers Like object from a Headers Record structure (Record<string, string | string[]>)
 * Returned Headers object is similar to the fetch Headers object but not exactly the same
 * https://developer.mozilla.org/en-US/docs/Web/API/Headers
 *
 * This is optimized to avoid creating the Headers Map if it's not strictly needed.
 * ie. for incoming header that only use get method, the Headers object is never created and instead the HeadersRecord is used directly.
 *
 * This function can be used to create a Headers object from incoming request that has the headers in an object structure.
 * ie IncomingMessage.headers or ApiGatewayEvent.headers
 *
 * @param headersObj
 * @returns
 */
export function headersFromRecord(headersObj: Record<string, string>, skipToLower = false): MionHeaders {
  // lazy load headers map
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
