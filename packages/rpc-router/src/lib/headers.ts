/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MionHeaders, MionResponse, PooledHeaders, ResponseDefaults} from '../types/context.ts';
import {JSON_CONTENT_TYPE} from '../constants.ts';
import {getResponseDefaults} from '../router.ts';

// ############# PUBLIC METHODS #############

// an array for a name appended twice on response headers (node's request record may hold one too)
type HeadersRecord = Record<string, string | string[]>;

const PROTO_KEY = '__proto__';

/** Case-insensitive HTTP headers, like the fetch Headers API but optimized for performance.
 *  https://developer.mozilla.org/en-US/docs/Web/API/Headers */
class MionHeadersImpl implements MionHeaders {
  // The record may be a plain object handed over by the platform (node's IncomingMessage.headers is one),
  // where `constructor` or `toString` would be "found" on the prototype chain. A prototype hit is never a
  // string, so a read checks the VALUE's type: cheaper than an own-key check per read (14 vs 23 ns).
  // `__proto__` is never written: on a plain object that assignment swaps the prototype.
  /** Read by the response headers pool only; request headers ignore it. */
  unused = true;

  constructor(protected headers: HeadersRecord) {}

  append(name: string, value: string): void {
    this.unused = false;
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
    this.unused = false;
    delete this.headers[name.toLowerCase()];
  }

  get(name: string): string | undefined | null {
    return readHeader(this.headers, name.toLowerCase());
  }

  set(name: string, value: string): void {
    this.unused = false;
    const ln = name.toLowerCase();
    if (ln === PROTO_KEY) return;
    this.headers[ln] = value as string;
  }

  has(name: string): boolean {
    return !!readHeader(this.headers, name.toLowerCase());
  }

  entries(): IterableIterator<[string, string]> {
    return Object.entries(this.headers)
      .map(([name, value]): [string, string] => [name, joined(value)])
      .values();
  }

  keys(): IterableIterator<string> {
    return new Map(Object.entries(this.headers)).keys();
  }

  values(): IterableIterator<string> {
    return Object.values(this.headers).map(joined).values();
  }
}

/** Response headers over a copy of the defaults, for an adapter that answers from a header record (uws, aws). */
export class RecordResponseHeaders extends MionHeadersImpl implements PooledHeaders {
  constructor(readonly defaults: ResponseDefaults) {
    super({...defaults});
  }

  /** Refuses what fetch `Headers` refuses: uws and aws write a header record as it is, unchecked. */
  set(name: string, value: string): void {
    assertHeaderSafe(name, value);
    super.set(name, value);
  }

  /** Keeps a repeated name's values apart, never joined: the adapter writes them its own way. */
  append(name: string, value: string): void {
    assertHeaderSafe(name, value);
    this.unused = false;
    const key = name.toLowerCase();
    if (key === PROTO_KEY) return;
    const current = this.headers[key] as unknown;
    // an empty earlier value counts as absent, and so does a prototype hit such as `constructor`
    if (Array.isArray(current)) current.push(value);
    else if (typeof current === 'string' && current) this.headers[key] = [current, value];
    else this.headers[key] = value;
  }

  /** Walks the headers with no pair array per header; a repeated name gives its values apart. */
  forEach(visit: (name: string, value: string | string[]) => void): void {
    for (const name in this.headers) visit(name, this.headers[name]);
  }
}

/** CR or LF splits the response (header injection); NUL ends it early on some hosts.
 *  The value stays out of the error: it may be what an attacker sent. */
export function assertHeaderSafe(name: string, value: string): void {
  if (hasControlBreak(name) || hasControlBreak(value))
    throw new TypeError(`Invalid header ${JSON.stringify(name.slice(0, 64))}: CR, LF or NUL`);
}

function hasControlBreak(text: string): boolean {
  // one pass, no allocation
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 13 || code === 10 || code === 0) return true;
  }
  return false;
}

/** The response headers of the fetch adapters (bun, cloudflare, vercel). */
export class FetchResponseHeaders implements PooledHeaders {
  /** What the reply hands to `Response`, which copies it. */
  readonly native = new Headers();
  unused = true;

  constructor(readonly defaults: ResponseDefaults) {
    // one set per name beats building from a record
    for (const name in defaults) this.native.set(name, defaults[name]);
  }

  set(name: string, value: string): void {
    this.unused = false;
    this.native.set(name, value);
  }
  append(name: string, value: string): void {
    this.unused = false;
    this.native.append(name, value);
  }
  delete(name: string): void {
    this.unused = false;
    this.native.delete(name);
  }
  get(name: string): string | null {
    return this.native.get(name);
  }
  has(name: string): boolean {
    return this.native.has(name);
  }
  entries(): IterableIterator<[string, string]> {
    return this.native.entries();
  }
  keys(): IterableIterator<string> {
    return this.native.keys();
  }
  values(): IterableIterator<string> {
    return this.native.values();
  }
}

// Pools of unwritten response headers: one serves exactly one request and comes back only if still unused.
const MAX_UNUSED_HEADERS = 256;
const unusedRecordHeaders: RecordResponseHeaders[] = [];
const unusedFetchHeaders: FetchResponseHeaders[] = [];
const newRecordHeaders = (defaults: ResponseDefaults) => new RecordResponseHeaders(defaults);
const newFetchHeaders = (defaults: ResponseDefaults) => new FetchResponseHeaders(defaults);

/** Response headers holding the defaults and nothing else, from the pool or new. */
export const getDefaultHeaders = (): RecordResponseHeaders => takeUnused(unusedRecordHeaders, newRecordHeaders);

/** Like `getDefaultHeaders`, over a native `Headers` for the fetch adapters. */
export const getDefaultFetchHeaders = (): FetchResponseHeaders => takeUnused(unusedFetchHeaders, newFetchHeaders);

/** Gives headers back once the reply is sent; written ones are dropped. */
export const releaseHeaders = (headers: RecordResponseHeaders): void => giveBackUnused(unusedRecordHeaders, headers);

function takeUnused<Pooled extends PooledHeaders>(pool: Pooled[], create: (defaults: ResponseDefaults) => Pooled): Pooled {
  const defaults = getResponseDefaults();
  const headers = pool.pop();
  if (headers?.defaults === defaults) return headers;
  // the router restarted: pooled headers carry the old defaults
  pool.length = 0;
  return create(defaults);
}

function giveBackUnused<Pooled extends PooledHeaders>(pool: Pooled[], headers: Pooled): void {
  if (headers.unused && pool.length < MAX_UNUSED_HEADERS) pool.push(headers);
}

export function replyFetch(mionResp: MionResponse, headers: FetchResponseHeaders): Response {
  // last, so a handler never replaces it; unused headers already hold the JSON one
  if (!headers.unused || mionResp.contentType !== JSON_CONTENT_TYPE) headers.set('content-type', mionResp.contentType);
  // Response copies its headers, so unused ones serve the next request
  const response = Response.json(mionResp.body, {status: mionResp.statusCode, headers: headers.native});
  giveBackUnused(unusedFetchHeaders, headers);
  return response;
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

function joined(value: string | string[]): string {
  return Array.isArray(value) ? value.join(', ') : value;
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
