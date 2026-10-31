/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {HttpMethod} from '../types/context.ts';

// null prototype: a `constructor` method off the wire must not read Object.prototype
const HTTP_METHODS: Readonly<Record<string, HttpMethod>> = Object.assign(Object.create(null), {
  GET: 'GET',
  HEAD: 'HEAD',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  CONNECT: 'CONNECT',
  OPTIONS: 'OPTIONS',
  TRACE: 'TRACE',
  PATCH: 'PATCH',
  QUERY: 'QUERY',
});

/** HTTP methods are case sensitive, so `get` is `OTHER`. */
export function toHttpMethod(method: string | undefined): HttpMethod {
  return (method && HTTP_METHODS[method]) || 'OTHER';
}
