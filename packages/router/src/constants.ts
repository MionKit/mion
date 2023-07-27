/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HookDef, RawRequest, RouteDef, RouterOptions} from './types';
import {DEFAULT_REFLECTION_OPTIONS} from '@mionkit/runtype';

export const ROUTE_PATH_ROOT = '/';

export const DEFAULT_ROUTE: Readonly<Required<RouteDef>> = {
    path: '',
    description: '',
    enableValidation: true,
    enableSerialization: true,
    useAsyncCallContext: false,
    route: () => null,
};
export const DEFAULT_HOOK: Readonly<Required<HookDef>> = {
    forceRunOnError: false,
    canReturnData: false,
    fieldName: '',
    description: '',
    enableValidation: true,
    enableSerialization: true,
    useAsyncCallContext: false,
    hook: () => null,
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

    /** Enables automatic parameter validation */
    enableValidation: true,

    /** Enables automatic serialization/deserialization */
    enableSerialization: true,

    /** Reflection and Deepkit Serialization-Validation options */
    reflectionOptions: DEFAULT_REFLECTION_OPTIONS,

    /** Custom body parser, defaults to Native JSON */
    bodyParser: JSON,

    /** set to true to generate router spec for clients.  */
    getPublicRoutesData: process.env.GENERATE_ROUTER_SPEC === 'true',

    /** Set true to automatically generate and id for every error.  */
    autoGenerateErrorId: false,
};

export const ROUTE_KEYS = Object.keys(DEFAULT_ROUTE);
export const HOOK_KEYS = Object.keys(DEFAULT_HOOK);
export const MAX_ROUTE_NESTING = 10;
