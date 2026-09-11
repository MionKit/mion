/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HandlerType} from '@mionjs/core';
import type {RemoteMethod, RouteMethod} from '../types/remoteMethods.ts';
import type {RouterOptions} from '../types/general.ts';

/** Floor of a derived chain limit: a body of `{}` / `[]`, some whitespace, or a slot for a
 *  no-params member is never refused. */
export const MIN_CHAIN_BODY_SIZE = 64;

/** A chain member's contribution to the request limit: its own `maxBodySize` option, else the
 *  compact-JSON maximum of its params tuple the build computed, else unknown (undefined). A member
 *  that takes no params and declares nothing costs no slot: the client sends none for it. */
function memberBodyBytes(method: RemoteMethod): number | undefined | null {
  if (method.type === HandlerType.rawMiddleFn) return null;
  const declared = method.options.maxBodySize;
  if (declared !== undefined) return declared;
  if (!method.paramsCount) return null;
  return method.paramsJsonMaxBytes;
}

/**
 * The request limit of one execution chain, settled once at registration:
 * 1. the route's own `maxBodySize` option;
 * 2. else, when every member with params has a number (its option or its params maximum), the
 *    keyed body `{"<id>":<params>,…}` at its largest, times `maxBodySizeFactor`;
 * 3. else undefined: the types cannot say, and the request takes the platform adapter's
 *    `maxBodySize` at resolve time (the adapter publishes it when the server starts).
 * The route's `options.maxBodySize` is read BEFORE it is overwritten with the resolved number.
 */
export function resolveChainMaxBodySize(methods: RemoteMethod[], route: RouteMethod, opts: RouterOptions): number | undefined {
  if (route.options.maxBodySize !== undefined) return route.options.maxBodySize;
  let total = 2; // the braces
  let slots = 0;
  for (const method of methods) {
    const bytes = memberBodyBytes(method);
    if (bytes === null) continue;
    if (bytes === undefined) return undefined;
    total += method.quotedId.length + 1 + bytes; // `"id":` + params
    slots++;
  }
  if (slots > 1) total += slots - 1; // the commas
  return Math.max(Math.ceil(total * opts.maxBodySizeFactor), MIN_CHAIN_BODY_SIZE);
}
