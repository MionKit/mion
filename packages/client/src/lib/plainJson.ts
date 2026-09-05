/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeadersSubset} from '@mionjs/core';

/**
 * True when every param, through arrays, is a scalar (string, number, boolean, null, undefined) or a HeadersSubset
 * (sent as HTTP headers, never in the body). Plain `JSON.stringify` then writes exactly what the server's decoders
 * read whatever the route's strategy is, so the first call can go out before the route's metadata is known. Any
 * other object (a plain object, a Date, a Map, a class instance) or a bigint depends on the strategy the server
 * compiled for the route (a compact route reads objects as positional arrays), so the client fetches the metadata
 * first and encodes with the route's own functions.
 */
export function survivesPlainJson(params: readonly unknown[]): boolean {
  for (const value of params) {
    if (!isPlainJsonValue(value)) return false;
  }
  return true;
}

function isPlainJsonValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return true;
    case 'object':
      if (Array.isArray(value)) return survivesPlainJson(value);
      return value instanceof HeadersSubset;
    default:
      return false;
  }
}
