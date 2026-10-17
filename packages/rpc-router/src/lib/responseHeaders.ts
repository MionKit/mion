/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {PooledHeaders, ResponseDefaults} from '../types/context.ts';
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
    // the router started again with other headers: what the pool holds is stale
    if (current !== this.defaults) {
      this.free.length = 0;
      this.defaults = current;
    }
    return this.free.pop() ?? this.create(current);
  }

  giveBack(headers: Pooled): void {
    if (headers.unused && this.free.length < this.max) this.free.push(headers);
  }
}

/** The response headers of the fetch adapters (bun, cloudflare, vercel): a native `Headers` plus whether anything wrote to it. */
export class FetchResponseHeaders implements PooledHeaders {
  /** What the reply hands to `Response`, which copies it. */
  readonly native = new Headers();
  unused: boolean;

  constructor(defaults: ResponseDefaults) {
    // one set per name beats building from a record
    for (const name in defaults) this.native.set(name, defaults[name]);
    this.unused = true;
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

  /** Last before the reply, so a handler never replaces it; unused headers already hold the JSON one. */
  setContentType(contentType: string): void {
    if (!this.unused || contentType !== JSON_CONTENT_TYPE) this.set('content-type', contentType);
  }
}

export const newFetchResponseHeaders = (defaults: ResponseDefaults): FetchResponseHeaders => new FetchResponseHeaders(defaults);
