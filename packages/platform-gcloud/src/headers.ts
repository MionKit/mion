/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MionHeaders, headersFromRecord} from '@mionjs/router';
import {IncomingMessage, ServerResponse} from 'http';

export function headersFromIncomingMessage(rawRequest: IncomingMessage): MionHeaders {
  // node's HTTP parser already lower-cased these, and Express hands node's own object straight
  // through, so re-walking and re-lowering every header per request bought nothing. Same call the
  // node adapter makes. NOT safe on API Gateway, which preserves header case.
  return headersFromRecord(rawRequest.headers as Record<string, string>, true);
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
  // for...in, so the common empty-defaults case allocates no entries array and no closure
  if (initialHeaders) for (const name in initialHeaders) resp.setHeader(name, initialHeaders[name]);
  return new ServerResponseHeadersImpl(resp);
}

function singleHeaderEntries(resp: ServerResponse): [string, string][] {
  return Object.entries(resp.getHeaders())
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : String(value)]);
}
