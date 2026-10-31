/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {fromBase64Url, FatalError, RpcError, StatusCodes} from '@mionjs/core';
import {findMionQueryParam} from './urlQuery.ts';

// `atob` throws a raw InvalidCharacterError on anything that is not base64, and one `GET /route?data=!`
// used to take the node and uws processes down with an unhandled rejection. No pre-check: a regex over
// the value doubled the cost of every query-body request (85 to 170 ns) to refuse what `atob` refuses.

/** The JSON body a GET carries in `?data=`, base64url encoded; undefined when there is none */
export function decodeQueryBody(urlQuery: string | undefined): string | undefined {
  if (!urlQuery) return undefined;
  const dataValue = findMionQueryParam(urlQuery, 'data');
  if (!dataValue) return undefined;
  try {
    return fromBase64Url(dataValue);
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
