/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MionHeaders, headersFromRecord} from '@mionjs/router';
import type {PooledHeaders, ResponseDefaults} from '@mionjs/router';
import type {HttpRequest} from '@mionjs/bin-uws';

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

/** uWS headers are write-only and must precede the body, so they are buffered lowercase-keyed and flushed in the corked reply. */
class BufferedHeadersImpl implements PooledHeaders {
  /** Readable by `forEachHeader` below, which is the only thing in the module allowed to touch it. */
  readonly record: Record<string, string>;
  unused = true;

  constructor(readonly defaults: ResponseDefaults) {
    this.record = {...defaults};
  }

  append(name: string, value: string): void {
    this.unused = false;
    const key = name.toLowerCase();
    this.record[key] = this.record[key] === undefined ? value : `${this.record[key]}, ${value}`;
  }
  delete(name: string): void {
    this.unused = false;
    delete this.record[name.toLowerCase()];
  }
  get(name: string): string | undefined | null {
    return this.record[name.toLowerCase()];
  }
  has(name: string): boolean {
    return this.record[name.toLowerCase()] !== undefined;
  }
  set(name: string, value: string): void {
    this.unused = false;
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

export const newBufferedHeaders = (defaults: ResponseDefaults): PooledHeaders => new BufferedHeadersImpl(defaults);

/** Walks the response headers with no pair array per header, for the corked reply. */
export function forEachHeader(headers: MionHeaders, visit: (name: string, value: string) => void): void {
  const record = (headers as BufferedHeadersImpl).record;
  for (const name in record) visit(name, record[name]);
}
