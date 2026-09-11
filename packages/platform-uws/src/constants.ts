/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_MAX_BODY_SIZE} from '@mionjs/core';
import {UwsHttpOptions} from './types.ts';

export const DEFAULT_UWS_HTTP_OPTIONS: UwsHttpOptions = {
  port: 80,
  defaultResponseHeaders: {},
  /** What a route takes when its own `maxBodySize` option is unset and its types cannot say: the
   *  shared 128 KB default, far under every platform's own ceiling */
  maxBodySize: DEFAULT_MAX_BODY_SIZE,
};
