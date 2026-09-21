/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MionHeaders, headersFromRecord} from '@mionjs/router';
import type {HttpRequest} from '@mionjs/bin-uws';

/** uWS headers are readable only synchronously inside the handler, so snapshot them; uWS already lower-cases the names. */
export function headersFromUwsRequest(req: HttpRequest): MionHeaders {
  const record: Record<string, string> = {};
  req.forEach((name, value) => {
    record[name] = record[name] === undefined ? value : `${record[name]}, ${value}`;
  });
  return headersFromRecord(record, true);
}

/** uWS headers are write-only and must precede the body, so they are buffered lowercase-keyed and flushed in the corked reply. */
class BufferedHeadersImpl implements MionHeaders {
  /** Readable by `forEachHeader` below, which is the only thing in the module allowed to touch it. */
  readonly record: Record<string, string> = {};

  append(name: string, value: string): void {
    const key = name.toLowerCase();
    this.record[key] = this.record[key] === undefined ? value : `${this.record[key]}, ${value}`;
  }
  delete(name: string): void {
    delete this.record[name.toLowerCase()];
  }
  get(name: string): string | undefined | null {
    return this.record[name.toLowerCase()];
  }
  has(name: string): boolean {
    return this.record[name.toLowerCase()] !== undefined;
  }
  set(name: string, value: string): void {
    this.record[name.toLowerCase()] = value;
  }
  entries(): IterableIterator<[string, string]> {
    return Object.entries(this.record).values();
  }
  keys(): IterableIterator<string> {
    return Object.keys(this.record).values();
  }
  values(): IterableIterator<string> {
    return Object.values(this.record).values();
  }
}

export function bufferedResponseHeaders(initialHeaders: Record<string, string> | null): MionHeaders {
  const headers = new BufferedHeadersImpl();
  // `for...in` keeps the write order, which matters because `server` is set AFTER the defaults and must stay unoverridable
  if (initialHeaders) for (const name in initialHeaders) headers.set(name, initialHeaders[name]);
  return headers;
}

/** Walks headers with no pair array per header, for the corked reply; falls back to `entries()` for any other MionHeaders. */
export function forEachHeader(headers: MionHeaders, visit: (name: string, value: string) => void): void {
  if (headers instanceof BufferedHeadersImpl) {
    const record = headers.record;
    for (const name in record) visit(name, record[name]);
    return;
  }
  for (const [name, value] of headers.entries()) visit(name, value);
}
