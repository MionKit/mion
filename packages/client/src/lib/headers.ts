/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HandlerType, HeadersSubset} from '@mionjs/core';
import {getMethod} from './methods.ts';

/** True when a subrequest's first param travels as HTTP headers rather than in the body; with no
 *  cached metadata yet (a route's FIRST optimistic call) the value itself answers. */
export function hasHeadersSubsetParam(id: string, params: any[] | undefined): boolean {
  const method = getMethod(id);
  if (method) return method.type === HandlerType.headersMiddleFn && !!method.headersParam;
  return params?.[0] instanceof HeadersSubset;
}

/** Spreading a `HeadersInit` only works for the plain-object form: a `Headers` instance has no own
 * enumerable properties and the `[name, value][]` form spreads as numeric indices. Internal, never exported. */
export function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (typeof Headers !== 'undefined' && headers instanceof Headers) return Object.fromEntries(headers.entries());
  // Any iterable of pairs (the `[name, value][]` form, a Map): spreading gives numeric indices, not headers.
  if (typeof (headers as Iterable<readonly [string, string]>)[Symbol.iterator] === 'function') {
    return Object.fromEntries(headers as Iterable<readonly [string, string]>);
  }
  return {...(headers as Record<string, string>)};
}
