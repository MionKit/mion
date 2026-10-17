/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MionResponse, PooledHeaders, ResponseDefaults} from '../types/context.ts';
import {JSON_CONTENT_TYPE} from '../constants.ts';
import {getResponseDefaults} from '../router.ts';

/** Holds only headers no request wrote to: one leaves for exactly one request and comes back only if still unused. */
export class UnusedHeadersPool<Pooled extends PooledHeaders> {
  private free: Pooled[] = [];
  private defaults: ResponseDefaults = getResponseDefaults();

  constructor(
    private readonly create: (defaults: ResponseDefaults) => Pooled,
    private readonly max = 256
  ) {}

  take(): Pooled {
    const current = getResponseDefaults();
    // the router started again: what the pool holds carries the old defaults
    if (current !== this.defaults) {
      this.free.length = 0;
      this.defaults = current;
    }
    return this.free.pop() ?? this.create(current);
  }

  giveBack(headers: Pooled): void {
    // a request in flight across a router restart gives back headers filled with the old defaults
    if (headers.unused && headers.defaults === this.defaults && this.free.length < this.max) this.free.push(headers);
  }
}

/** Response headers of the fetch adapters (bun, cloudflare, vercel). */
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

export class FetchHeadersPool extends UnusedHeadersPool<FetchResponseHeaders> {
  constructor() {
    super((defaults) => new FetchResponseHeaders(defaults));
  }

  reply(mionResp: MionResponse, headers: FetchResponseHeaders): Response {
    // last, so a handler never replaces it; unused headers already hold the JSON one
    if (!headers.unused || mionResp.contentType !== JSON_CONTENT_TYPE) headers.set('content-type', mionResp.contentType);
    // Response copies its headers, so unused ones serve the next request
    const response = Response.json(mionResp.body, {status: mionResp.statusCode, headers: headers.native});
    this.giveBack(headers);
    return response;
  }
}
