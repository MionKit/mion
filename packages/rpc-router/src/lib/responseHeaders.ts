/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MionHeaders, ResponseDefaults} from '../types/context.ts';
import {JSON_CONTENT_TYPE, SERVER_HEADER_VALUE} from '../constants.ts';

/** The response headers a handler sees: nothing is built until the first write, which creates the adapter's own
 *  store seeded with `server` and then `defaults` (lowercased, from getResponseDefaults). Until then reads see
 *  that same content. The adapter's reply reads `written`. */
export class LazyResponseHeaders<Store extends MionHeaders> implements MionHeaders {
  private store: Store | undefined = undefined;

  constructor(
    readonly defaults: ResponseDefaults,
    // a module-level function, never a closure per request
    private readonly createStore: (defaults: ResponseDefaults) => Store
  ) {}

  /** The store once anything was written; undefined means the reply sends `defaults` alone. */
  get written(): Store | undefined {
    return this.store;
  }

  /** The store, created now if nothing was written: for a reply that must send the defaults. */
  toStore(): Store {
    return (this.store ??= this.createStore(this.defaults));
  }

  append(name: string, value: string): void {
    this.toStore().append(name, value);
  }
  set(name: string, value: string): void {
    this.toStore().set(name, value);
  }
  delete(name: string): void {
    // deleting a name nothing holds builds nothing
    if (this.store || readDefault(this.defaults, name) !== undefined) this.toStore().delete(name);
  }
  get(name: string): string | undefined | null {
    return this.store ? this.store.get(name) : readDefault(this.defaults, name);
  }
  has(name: string): boolean {
    return this.store ? this.store.has(name) : readDefault(this.defaults, name) !== undefined;
  }
  entries(): IterableIterator<[string, string]> {
    return this.store ? this.store.entries() : Object.entries(untouchedHeaders(this.defaults)).values();
  }
  keys(): IterableIterator<string> {
    return this.store ? this.store.keys() : Object.keys(untouchedHeaders(this.defaults)).values();
  }
  values(): IterableIterator<string> {
    return this.store ? this.store.values() : Object.values(untouchedHeaders(this.defaults)).values();
  }
}

/** A string check, not undefined: a `constructor` name would otherwise find Object.prototype's function. */
function readDefault(defaults: ResponseDefaults, name: string): string | undefined {
  const lowerName = name.toLowerCase();
  const value = defaults[lowerName] as unknown;
  if (typeof value === 'string') return value;
  return lowerName === 'server' ? SERVER_HEADER_VALUE : undefined;
}

/** What a store would hold before any write: `server`, unless a default replaces it, then the defaults. */
function untouchedHeaders(defaults: ResponseDefaults): ResponseDefaults {
  return defaults.server === undefined ? {server: SERVER_HEADER_VALUE, ...defaults} : defaults;
}

/** True when the defaults record holds no header, so an untouched reply needs nothing from it. */
function hasNoHeaders(defaults: ResponseDefaults): boolean {
  for (const _name in defaults) return false;
  return true;
}

// ############# FETCH ADAPTERS (bun, cloudflare, vercel) #############

/** `server` first so a default of that name replaces it; `new Headers()` plus sets beats building from a record. */
function newFetchHeaders(defaults: ResponseDefaults): Headers {
  const headers = new Headers();
  headers.set('server', SERVER_HEADER_VALUE);
  for (const name in defaults) headers.set(name, defaults[name]);
  return headers;
}

export function fetchResponseHeaders(defaults: ResponseDefaults): LazyResponseHeaders<Headers> {
  return new LazyResponseHeaders(defaults, newFetchHeaders);
}

/** Built once on first use: `Response` copies the headers it is given, so one instance serves every untouched reply. */
let jsonReplyHeaders: Headers | undefined;

/** The `headers` of the reply, `contentType` written last so nothing overrides it. */
export function fetchReplyHeaders(headers: LazyResponseHeaders<Headers>, contentType: string): Headers {
  const store = headers.written ?? (hasNoHeaders(headers.defaults) ? undefined : headers.toStore());
  if (!store) {
    if (contentType === JSON_CONTENT_TYPE)
      return (jsonReplyHeaders ??= new Headers({server: SERVER_HEADER_VALUE, 'content-type': JSON_CONTENT_TYPE}));
    return new Headers({server: SERVER_HEADER_VALUE, 'content-type': contentType});
  }
  store.set('content-type', contentType);
  return store;
}
