/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MionHeaders, headersFromRecord} from '@mionjs/router';
import type {HttpRequest} from '@mionjs/bin-uws';

const SET_COOKIE = 'set-cookie';

/** uWS headers are readable only synchronously inside the handler, so snapshot them; uWS already lower-cases the names. */
export function headersFromUwsRequest(req: HttpRequest): MionHeaders {
  const record: Record<string, string> = {};
  req.forEach((name, value) => {
    // a string check, not undefined: a `constructor` header would otherwise find Object.prototype's function
    const previous = record[name];
    record[name] = typeof previous === 'string' ? `${previous}, ${value}` : value;
  });
  return headersFromRecord(record, true);
}

/** uWS headers are write-only and must precede the body, so they are buffered and flushed in the corked reply. */
class BufferedHeadersImpl implements MionHeaders {
  /** Outside the class only `forEachHeader` reads it; null-prototype so `constructor` misses Object.prototype.
   *  An array only for set-cookie: RFC 6265 forbids folding it. */
  readonly record: Record<string, string | string[]> = Object.create(null);

  append(name: string, value: string): void {
    const key = name.toLowerCase();
    const current = this.record[key];
    if (current === undefined) this.record[key] = value;
    else if (Array.isArray(current)) current.push(value);
    else this.record[key] = key === SET_COOKIE ? [current, value] : `${current}, ${value}`;
  }
  delete(name: string): void {
    delete this.record[name.toLowerCase()];
  }
  get(name: string): string | undefined | null {
    return joined(this.record[name.toLowerCase()]);
  }
  has(name: string): boolean {
    return this.record[name.toLowerCase()] !== undefined;
  }
  set(name: string, value: string): void {
    this.record[name.toLowerCase()] = value;
  }
  entries(): IterableIterator<[string, string]> {
    return Object.entries(this.record)
      .map(([name, value]): [string, string] => [name, joined(value) as string])
      .values();
  }
  keys(): IterableIterator<string> {
    return Object.keys(this.record).values();
  }
  values(): IterableIterator<string> {
    return Object.values(this.record)
      .map((value) => joined(value) as string)
      .values();
  }
}

function joined(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(', ') : value;
}

export function bufferedResponseHeaders(initialHeaders: Record<string, string> | null): MionHeaders {
  const headers = new BufferedHeadersImpl();
  // `for...in` keeps the write order, which matters because `server` is set AFTER the defaults and must stay unoverridable
  if (initialHeaders) for (const name in initialHeaders) headers.set(name, initialHeaders[name]);
  return headers;
}

/** No pair array per header, for the corked reply. */
export function forEachHeader(headers: MionHeaders, visit: (name: string, value: string) => void): void {
  if (headers instanceof BufferedHeadersImpl) {
    const record = headers.record;
    for (const name in record) {
      const value = record[name];
      // uWS writes a repeated name as its own line, so each cookie reaches the wire apart
      if (typeof value === 'string') visit(name, value);
      else for (let i = 0; i < value.length; i++) visit(name, value[i]);
    }
    return;
  }
  for (const [name, value] of headers.entries()) visit(name, value);
}
