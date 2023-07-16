/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {mion404Handler} from '@mionkit/hooks';
import {RouteDef, RouterOptions, SerializationOptions} from './types';
import {RawRequest} from '@mionkit/core/';

export const ROUTE_PATH_ROOT = '/';

export const DEFAULT_ROUTE: Readonly<Required<RouteDef>> = {
    path: '',
    description: '',
    enableValidation: true,
    enableSerialization: true,
    route: () => null,
};

export const DEFAULT_REQUEST: Readonly<Required<RawRequest>> = {
    headers: {},
    body: '{}',
};

export const IS_TEST_ENV = process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';

export const DEFAULT_ROUTE_OPTIONS: Readonly<RouterOptions> = {
    /** Prefix for all routes, i.e: api/v1.
     * path separator is added between the prefix and the route */
    prefix: '',

    /** Suffix for all routes, i.e: .json.
     * No path separator is added between the route and the suffix */
    suffix: '',

    /** Function that transforms the path before finding a route */
    pathTransform: undefined,

    /**
     * Configures the fieldName in the request/response body
     * used to send/receive route's params/response
     * */
    routeFieldName: undefined,

    /** set to true to generate router spec for clients.  */
    getPublicRoutesData: process.env.GENERATE_ROUTER_SPEC === 'true',

    /** Lazy load reflection.  */
    lazyLoadReflection: true,
};

export const DEFAULT_SERIALIZATION_OPTIONS: Readonly<SerializationOptions> = {
    /** enable automatic parameter validation, defaults to true */
    enableValidation: true,
    /** Enables serialization/deserialization */
    enableSerialization: true,
};

export const ROUTE_KEYS = Object.keys(DEFAULT_ROUTE);
export const MAX_ROUTE_NESTING = 10;
