/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HttpOptions} from './types';

export const CONTENT_TYPE_HEADER_NAME = 'Content-Type';
export const ACCEPT_JSON = 'application/json';
export const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
export const ALLOWED_HTTP_METHODS = ['POST', 'OPTIONS'];
export const JSON_TYPE_HEADER = {CONTENT_TYPE_HEADER_NAME: JSON_CONTENT_TYPE};

export const DEFAULT_HTTP_OPTIONS: HttpOptions = {
    protocol: 'http',
    port: 80,
    options: {},
    headers: {},
    sameOrigin: false,
    maxBodySize: 2097152, // 2Mb
};

export const isMethodAllowed = (method: string) => !!ALLOWED_HTTP_METHODS.find((allowed) => allowed === method);
