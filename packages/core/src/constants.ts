/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CoreOptions} from '@mionkit/core/src/binaryTypes';

export const DEFAULT_CORE_OPTIONS: CoreOptions = {
    /** automatically generate and uuid */
    autoGenerateErrorId: false,
};

export const PATH_SEPARATOR = '/';
export const ROUTE_PATH_ROOT = PATH_SEPARATOR;

export const GET_REMOTE_METHODS_BY_ID = 'mionGetRemoteMethodsInfoById';
export const GET_REMOTE_METHODS_BY_PATH = 'mionGetRemoteMethodsInfoByPath';

export const ROUTER_ITEM_SEPARATOR_CHAR = '/';
export const MAX_UNKNOWN_KEYS = 10;
export const MAX_STACK_DEPTH = 50;
