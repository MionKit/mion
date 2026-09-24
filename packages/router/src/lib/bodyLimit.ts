/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HandlerType, MION_ROUTES} from '@mionjs/core';
import type {RemoteMethod, RouteMethod} from '../types/remoteMethods.ts';
import type {RouterOptions} from '../types/general.ts';

/** Floor of a derived chain limit: a body of `{}` / `[]`, whitespace, or a no-params slot is never refused. */
export const MIN_CHAIN_BODY_SIZE = 64;

/** A member's contribution: its own `maxBodySize` option, else the compact-JSON maximum of its params
 *  tuple the build computed, else unknown. One with no params and no option costs no slot at all. */
function memberBodyBytes(method: RemoteMethod): number | undefined | null {
  if (method.type === HandlerType.rawMiddleware) return null;
  const declared = method.options.maxBodySize;
  if (declared !== undefined) return declared;
  if (!method.paramsCount) return null;
  return method.paramsJsonMaxBytes;
}

/** The request limit of one chain, settled once at registration: the route's own `maxBodySize` option,
 *  else, when every member with params has a number, the largest keyed body `{"<id>":<params>,…}` times
 *  `maxBodySizeFactor`, else undefined, meaning the types cannot say and the request takes the adapter's
 *  `maxBodySize` at resolve time. Reads `options.maxBodySize` BEFORE it is overwritten with the result. */
export function resolveChainMaxBodySize(methods: RemoteMethod[], route: RouteMethod, opts: RouterOptions): number | undefined {
  if (route.options.maxBodySize !== undefined) return route.options.maxBodySize;
  let total = 2; // the braces
  let slots = 0;
  for (const method of methods) {
    // present only to send the version header: a client sends no sync ids unless the check is on
    if (method.id === MION_ROUTES.syncRoutes && !opts.syncRoutes) continue;
    const bytes = memberBodyBytes(method);
    if (bytes === null) continue;
    if (bytes === undefined) return undefined;
    total += method.quotedId.length + 1 + bytes; // `"id":` + params
    slots++;
  }
  if (slots > 1) total += slots - 1; // the commas
  return Math.max(Math.ceil(total * opts.maxBodySizeFactor), MIN_CHAIN_BODY_SIZE);
}
