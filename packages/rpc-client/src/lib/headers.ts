/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HandlerType, HeadersSubset, RpcError} from '@mionjs/core';
import {getMethod} from './methods.ts';
import type {CallContext} from '../types.ts';

/** True when a subrequest's first param travels as HTTP headers rather than in the body; with no
 *  cached metadata yet (a route's FIRST optimistic call) the value itself answers. */
export function hasHeadersSubsetParam(id: string, params: any[] | undefined): boolean {
  const method = getMethod(id);
  if (method) return method.type === HandlerType.headersMiddleware && !!method.headersParam;
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

export function extractRequestHeaders(context: CallContext): Record<string, string> {
  const headers: Record<string, string> = {};
  const subRequestIds = Object.keys(context.subRequestList);

  for (let i = 0; i < subRequestIds.length; i++) {
    const id = subRequestIds[i];
    const subRequest = context.subRequestList[id];
    if (!subRequest || !hasHeadersSubsetParam(id, subRequest.params)) continue;
    Object.assign(headers, extractHeadersFromParams(subRequest.params));
  }

  return headers;
}

function extractHeadersFromParams(params: any[]): Record<string, string> {
  if (!params || params.length === 0) {
    throw new RpcError({
      type: 'missing-headers-param',
      publicMessage: 'HeadersFn requires a HeadersSubset parameter.',
    });
  }

  const firstParam = params[0];

  if (firstParam instanceof HeadersSubset) {
    return firstParam.headers as Record<string, string>;
  }

  if (firstParam && typeof firstParam === 'object' && 'headers' in firstParam && typeof firstParam.headers === 'object') {
    return firstParam.headers as Record<string, string>;
  }

  throw new RpcError({
    type: 'invalid-headers-param',
    publicMessage: 'HeadersFn first parameter must be a HeadersSubset instance or object with headers property.',
  });
}

export function reconstructHeadersSubsetFromResponse(
  methodId: string,
  responseHeaders: Headers
): HeadersSubset<string, string> | undefined {
  const method = getMethod(methodId);

  if (!method?.headersReturn?.headerNames || method.headersReturn.headerNames.length === 0) {
    return undefined;
  }

  const headerNames = method.headersReturn.headerNames;
  const headersMap: Record<string, string> = {};

  for (const name of headerNames) {
    const value = responseHeaders.get(name);
    if (value !== undefined && value !== null) {
      headersMap[name] = value;
    }
  }

  if (Object.keys(headersMap).length > 0) {
    return new HeadersSubset(headersMap);
  }

  return undefined;
}
