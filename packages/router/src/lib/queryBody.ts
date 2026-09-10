/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {fromBase64Url, FatalError, RpcError, SerializerModes, StatusCodes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';
import {findMionQueryParam} from './urlQuery.ts';

// `atob` throws a raw InvalidCharacterError on anything that is not base64: every adapter used to
// call this outside its guard, so one `GET /route?data=!` took the node and uws processes down with
// an unhandled rejection. The catch below turns that throw into a typed error; no pre-check, since a
// regex over the value would double the cost of every query-body request (measured: 85 to 170 ns)
// to refuse exactly what `atob` refuses anyway.

/** Result of decoding a base64url query body from ?data= */
export interface QueryBodyResult {
  rawBody: string;
  bodyType: SerializerCode;
}

/** Detects and decodes base64url-encoded request body from ?data= query param.
 * Returns decoded body + bodyType if found, undefined otherwise. */
export function decodeQueryBody(urlQuery: string | undefined, rawBody: unknown): QueryBodyResult | undefined {
  if (rawBody) return undefined;
  if (!urlQuery) return undefined;
  const dataValue = findMionQueryParam(urlQuery, 'data');
  if (!dataValue) return undefined;
  try {
    return {rawBody: fromBase64Url(dataValue), bodyType: SerializerModes.stringifyJson};
  } catch (err) {
    throw invalidQueryBody(err);
  }
}

function invalidQueryBody(originalError?: unknown): RpcError<'invalid-query-body'> {
  return new FatalError({
    statusCode: StatusCodes.UNEXPECTED_ERROR,
    type: 'invalid-query-body',
    publicMessage: 'Invalid query body: the data parameter is not base64url encoded.',
    originalError: originalError as Error | undefined,
  });
}
