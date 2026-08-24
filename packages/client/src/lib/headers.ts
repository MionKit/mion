/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

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
