/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MionHeaders, headersFromRecord} from '@mionjs/router';
import {IncomingMessage, ServerResponse} from 'http';

export function headersFromIncomingMessage(rawRequest: IncomingMessage): MionHeaders {
  return headersFromRecord(rawRequest.headers as Record<string, string>);
}

/**
 * Reusable class for managing HTTP response headers with ServerResponse integration
 * Provides a MionHeaders interface that wraps Node.js ServerResponse header methods
 */
class ServerResponseHeadersImpl implements MionHeaders {
  constructor(private resp: ServerResponse) {}

  append(name: string, value: string): void {
    this.resp.appendHeader(name, value);
  }

  delete(name: string): void {
    this.resp.removeHeader(name);
  }

  get(name: string): string | undefined | null {
    const value = this.resp.getHeader(name);
    if (Array.isArray(value)) return value.join(', ');
    return value as string;
  }

  has(name: string): boolean {
    return this.resp.hasHeader(name);
  }

  set(name: string, value: string): void {
    this.resp.setHeader(name, value);
  }

  entries(): IterableIterator<[string, string]> {
    return new Map(singleHeaderEntries(this.resp)).entries();
  }

  keys(): IterableIterator<string> {
    return new Map(singleHeaderEntries(this.resp)).keys();
  }

  values(): IterableIterator<string> {
    return new Map(singleHeaderEntries(this.resp)).values();
  }
}

export function headersFromServerResponse(resp: ServerResponse, initialHeaders: Record<string, string> | null): MionHeaders {
  if (initialHeaders) Object.entries(initialHeaders).forEach(([name, value]) => resp.setHeader(name, value));
  return new ServerResponseHeadersImpl(resp);
}

function singleHeaderEntries(resp: ServerResponse): [string, string][] {
  return Object.entries(resp.getHeaders())
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : String(value)]);
}
