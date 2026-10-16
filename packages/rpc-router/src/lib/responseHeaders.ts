/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MionHeaders} from '../types/context.ts';
import {JSON_CONTENT_TYPE, SERVER_HEADER_VALUE} from '../constants.ts';

type Defaults = Readonly<Record<string, string>>;

/** The response headers a handler sees: nothing is built until the first write, which creates the adapter's own
 *  store seeded with `defaults` (lowercased, from getResponseDefaults). The adapter's reply reads `written`. */
export class LazyResponseHeaders<Store extends MionHeaders> implements MionHeaders {
  private store: Store | undefined = undefined;

  constructor(
    readonly defaults: Defaults,
    // a module-level function, never a closure per request
    private readonly createStore: (defaults: Defaults) => Store
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
    if (this.store || this.defaults[name.toLowerCase()] !== undefined) this.toStore().delete(name);
  }
  get(name: string): string | undefined | null {
    return this.store ? this.store.get(name) : this.defaults[name.toLowerCase()];
  }
  has(name: string): boolean {
    return this.store ? this.store.has(name) : this.defaults[name.toLowerCase()] !== undefined;
  }
  entries(): IterableIterator<[string, string]> {
    return this.store ? this.store.entries() : Object.entries(this.defaults).values();
  }
  keys(): IterableIterator<string> {
    return this.store ? this.store.keys() : Object.keys(this.defaults).values();
  }
  values(): IterableIterator<string> {
    return this.store ? this.store.values() : Object.values(this.defaults).values();
  }
}

/** True when the defaults record holds no header, so an untouched reply needs nothing from it. */
export function hasNoHeaders(defaults: Defaults): boolean {
  for (const _name in defaults) return false;
  return true;
}

// ############# FETCH ADAPTERS (bun, cloudflare, vercel) #############

/** `server` first so a default of that name replaces it; `new Headers()` plus sets beats building from a record. */
function newFetchHeaders(defaults: Defaults): Headers {
  const headers = new Headers();
  headers.set('server', SERVER_HEADER_VALUE);
  for (const name in defaults) headers.set(name, defaults[name]);
  return headers;
}

export function fetchResponseHeaders(defaults: Defaults): LazyResponseHeaders<Headers> {
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
