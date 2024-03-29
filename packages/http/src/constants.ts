/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {NodeHttpOptions} from './types';

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
    /**
     * 256KB by default, same as lambda payload
     * @link https://docs.aws.amazon.com/lambda/latest/operatorguide/payload.html
     * */
    maxBodySize: 256000, // 256KB
};
