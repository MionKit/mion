/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {fromBase64Url, RpcError, SerializerModes, StatusCodes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';

/** RFC 4648 §5 alphabet, optional padding. Checked BEFORE `atob`, which throws a raw
 *  InvalidCharacterError on anything else: every adapter used to call this outside its guard, so one
 *  `GET /route?data=!` took the node and uws processes down with an unhandled rejection. */
const BASE64URL = /^[A-Za-z0-9_-]*={0,2}$/;

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
  const dataValue = extractDataParam(urlQuery);
  if (!dataValue) return undefined;
  if (!BASE64URL.test(dataValue) || dataValue.replace(/=+$/, '').length % 4 === 1) throw invalidQueryBody();
  try {
    return {rawBody: fromBase64Url(dataValue), bodyType: SerializerModes.stringifyJson};
  } catch (err) {
    throw invalidQueryBody(err);
  }
}

function invalidQueryBody(originalError?: unknown): RpcError<'invalid-query-body'> {
  return new RpcError({
    statusCode: StatusCodes.UNEXPECTED_ERROR,
    type: 'invalid-query-body',
    publicMessage: 'Invalid query body: the data parameter is not base64url encoded.',
    originalError: originalError as Error | undefined,
  });
}

function extractDataParam(urlQuery: string): string | undefined {
  if (urlQuery.startsWith('data=')) {
    const ampIndex = urlQuery.indexOf('&', 5);
    return ampIndex === -1 ? urlQuery.slice(5) : urlQuery.slice(5, ampIndex);
  }
  const idx = urlQuery.indexOf('&data=');
  if (idx === -1) return undefined;
  const start = idx + 6;
  const ampIndex = urlQuery.indexOf('&', start);
  return ampIndex === -1 ? urlQuery.slice(start) : urlQuery.slice(start, ampIndex);
}
