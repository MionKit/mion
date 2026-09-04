/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MionHeaders, headersFromRecord} from '@mionjs/router';
import type {HttpRequest} from '@mionjs/bin-uws';

/** uWS request headers are only readable synchronously inside the handler, so snapshot them into a
 *  record up front. uWS already lower-cases header names; repeated headers join with ', '. */
export function headersFromUwsRequest(req: HttpRequest): MionHeaders {
  const record: Record<string, string> = {};
  req.forEach((name, value) => {
    record[name] = record[name] === undefined ? value : `${record[name]}, ${value}`;
  });
  return headersFromRecord(record, true);
}

/**
 * uWS response headers are write-only and must all be written before the body, so this
 * implementation buffers them in a record (lowercase-keyed, per the MionHeaders case-insensitivity
 * contract) and the adapter flushes them inside the corked reply.
 */
class BufferedHeadersImpl implements MionHeaders {
  private record: Record<string, string> = {};

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
  if (initialHeaders) Object.entries(initialHeaders).forEach(([name, value]) => headers.set(name, value));
  return headers;
}
