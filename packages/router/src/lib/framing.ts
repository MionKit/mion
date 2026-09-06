/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SerializerModes, type SerializerCode} from '@mionjs/core';
import type {RemoteMethod} from '../types/remoteMethods.ts';

/**
 * How a response body is handed to the platform, derived from the encoder strategies of the
 * execution chain: bytes when the route's return is `binary` (a middleFn without the binary pair
 * is skipped by the binary writer, see ensureBinaryJitFns), a JSON string the router joins when any
 * member with return data encodes `direct` (that encoder writes the string itself, so every member
 * is stringified one by one), otherwise a JSON-safe value the platform stringifies.
 */
export function getChainFraming(methods: RemoteMethod[], routeIsBinary: boolean): SerializerCode {
  if (routeIsBinary) return SerializerModes.binary;
  for (const method of methods) {
    if (method.hasReturnData && method.returnJitFns.json.strategy === 'direct') return SerializerModes.stringifyJson;
  }
  return SerializerModes.json;
}
