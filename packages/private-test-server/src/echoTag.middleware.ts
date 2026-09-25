/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CallContext} from '@mionjs/router';

/** A middleware with only optional params: the client may set it up or not */
export function echoTag(_ctx: CallContext, tag?: string): string {
  return tag ?? '';
}
