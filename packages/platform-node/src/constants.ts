/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_MAX_BODY_SIZE} from '@mionjs/core';
import {NodeHttpOptions} from './types.ts';

export const CONTENT_TYPE_HEADER_NAME = 'content-type';
export const ACCEPT_JSON = 'application/json';
export const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
export const JSON_TYPE_HEADER = {CONTENT_TYPE_HEADER_NAME: JSON_CONTENT_TYPE};

export const DEFAULT_HTTP_OPTIONS: NodeHttpOptions = {
  protocol: 'http',
  port: 80,
  options: {
    /** @default 8KB same as default value in new node versions */
    maxHeaderSize: 8192,
  },
  defaultResponseHeaders: {},
  /** What a route takes when its own `maxBodySize` option is unset and its types cannot say: the
   *  shared 128 KB default, far under every platform's own ceiling */
  maxBodySize: DEFAULT_MAX_BODY_SIZE,
  asMiddleware: false,
};
