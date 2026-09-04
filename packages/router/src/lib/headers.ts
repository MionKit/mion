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
  // Every read is an OWN-key read: the record may be a plain object handed over by the platform
  // (node's IncomingMessage.headers is one), where `constructor` or `toString` would otherwise be
  // "found" on the prototype chain. `__proto__` is never written, since on a plain object that
  // assignment swaps the prototype instead of storing a header.
  constructor(private headers: HeadersRecord) {}

  append(name: string, value: string): void {
    const nl = name.toLowerCase();
    if (nl === PROTO_KEY) return;
    const existing = Object.hasOwn(this.headers, nl) ? this.headers[nl] : undefined;
    const headerValue = toSingleHeader(value);
    if (existing) {
      this.headers[nl] = `${existing}, ${headerValue}`;
    } else {
      this.headers[nl] = headerValue;
    }
  }

  delete(name: string): void {
    const nl = name.toLowerCase();
    if (Object.hasOwn(this.headers, nl)) delete this.headers[nl];
  }

  get(name: string): string | undefined | null {
    const nl = name.toLowerCase();
    return Object.hasOwn(this.headers, nl) ? this.headers[nl] : undefined;
  }

  set(name: string, value: string): void {
    const ln = name.toLowerCase();
    if (ln === PROTO_KEY) return;
    this.headers[ln] = value as string;
  }

  has(name: string): boolean {
    const nl = name.toLowerCase();
    return Object.hasOwn(this.headers, nl) && !!this.headers[nl];
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
