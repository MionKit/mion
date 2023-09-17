/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {BunHttpOptions} from './types';

export const CONTENT_TYPE_HEADER_NAME = 'content-type';
export const ACCEPT_JSON = 'application/json';
export const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
export const JSON_TYPE_HEADER = {CONTENT_TYPE_HEADER_NAME: JSON_CONTENT_TYPE};

export const DEFAULT_BUN_HTTP_OPTIONS: BunHttpOptions = {
    port: 80,
    options: {},
    defaultResponseHeaders: {},
    /**
     * 256KB by default, same as lambda payload
     * @link https://docs.aws.amazon.com/lambda/latest/operatorguide/payload.html
     * */
    maxBodySize: 256000, // 256KB
};
