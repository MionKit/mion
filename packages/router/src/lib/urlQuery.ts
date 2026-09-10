/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * The ONE reader of the url query string. Every parameter the router reads goes through it, `id=`
 * for a batch and `data=` for a query body, so there is one set of rules for how a query splits.
 * Router-internal: nothing outside this package reads the query string.
 *
 * Values come back RAW, exactly as they sit in the url: no percent-decoding, no `+` translated to a
 * space. A consumer that needs a decoded value calls `decodeURIComponent` itself, which is what lets
 * the batch id decode while a base64url query body must not.
 */
export function findMionQueryParam(urlQuery: string | undefined, name: string): string | undefined {
  // an empty name is not a parameter: without this, a hostile `?=x` would answer a lookup for ''
  if (!urlQuery || !name) return undefined;
  const queryLength = urlQuery.length;
  const nameLength = name.length;
  let start = 0;
  while (start < queryLength) {
    let end = urlQuery.indexOf('&', start);
    if (end === -1) end = queryLength;
    // the name runs to the first `=` of this parameter, or to its end when it carries no value
    let nameEnd = urlQuery.indexOf('=', start);
    if (nameEnd === -1 || nameEnd > end) nameEnd = end;
    // compare the length first, so a name that merely starts with the wanted one is not a match
    if (nameEnd - start === nameLength && urlQuery.startsWith(name, start)) {
      // `?flag` and `?flag=` both read as present with an empty value
      return nameEnd === end ? '' : urlQuery.slice(nameEnd + 1, end);
    }
    start = end + 1;
  }
  return undefined;
}
