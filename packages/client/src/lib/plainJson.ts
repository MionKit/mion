/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The optimistic first request sends the params as plain JSON.stringify, before the client knows
// the route's encoder strategy. That only round-trips when the plain JSON form IS the wire form
// for every strategy: scalars, and arrays of scalars (a tuple / array of scalars is the same on the
// compact wire). Any object could ride a positional (compact) or binary wire, a Date / Map / Set
// needs the compiled encoder, and a bigint has no JSON form at all: for those the client fetches
// the metadata first and encodes with the real strategy.
import {HeadersSubset} from '@mionjs/core';

/** True when `JSON.stringify(value)` is the wire form under every encoder strategy. A HeadersSubset
 *  param never reaches the body (it is sent as HTTP headers), so it does not count. */
export function survivesPlainJson(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (value instanceof HeadersSubset) return true;
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return true;
    case 'object':
      return Array.isArray(value) && value.every(survivesPlainJson);
    default:
      // bigint, symbol, function
      return false;
  }
}
