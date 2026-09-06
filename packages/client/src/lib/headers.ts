/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HandlerType, HeadersSubset, routesCache} from '@mionjs/core';

/**
 * True when a subrequest's first param is the HeadersSubset of a headers middleFn, so it travels as
 * HTTP headers and stays out of the body. The cached metadata decides when there is any; on a route's
 * FIRST optimistic call there may be none yet, and the value itself answers instead.
 */
export function hasHeadersSubsetParam(id: string, params: any[] | undefined): boolean {
  const method = routesCache.getMetadata(id);
  if (method) return method.type === HandlerType.headersMiddleFn && !!method.headersParam;
  return params?.[0] instanceof HeadersSubset;
}

/**
 * Normalizes any `HeadersInit` into a plain record so it can be merged with the
 * per-request headers. Spreading a `HeadersInit` directly only works for the
 * plain-object form: a `Headers` instance has no own enumerable properties (every
 * header would be silently dropped) and the `[name, value][]` form would spread as
 * numeric indices. Deliberately NOT re-exported from the package entry: this is an
 * internal helper, not client API.
 */
export function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (typeof Headers !== 'undefined' && headers instanceof Headers) return Object.fromEntries(headers.entries());
  // Covers the `[name, value][]` form and any other iterable of pairs (a Map, say):
  // spreading those into an object would produce numeric indices, not headers.
  if (typeof (headers as Iterable<readonly [string, string]>)[Symbol.iterator] === 'function') {
    return Object.fromEntries(headers as Iterable<readonly [string, string]>);
  }
  return {...(headers as Record<string, string>)};
}
