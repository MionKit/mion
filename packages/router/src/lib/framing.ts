/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SerializerModes, type SerializerCode} from '@mionjs/core';
import type {RemoteMethod} from '../types/remoteMethods.ts';

/** How the response body reaches the platform, from the chain's encoder strategies: a JSON string
 *  the router joins when any member with return data encodes `direct` (that encoder writes the
 *  string itself), otherwise a value the platform stringifies. */
export function getChainFraming(methods: RemoteMethod[]): SerializerCode {
  for (const method of methods) {
    if (method.hasReturnData && method.returnJitFns.json.strategy === 'direct') return SerializerModes.stringifyJson;
  }
  return SerializerModes.json;
}
