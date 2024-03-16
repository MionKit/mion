/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RouterOptions} from './types/general';

export const IS_TEST_ENV = process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';

export const ROUTE_DEFAULT_PARAMS = ['context'];

export const DEFAULT_ROUTE_OPTIONS = {
    /** Prefix for all routes, i.e: api/v1.
     * path separator is added between the prefix and the route */
    prefix: '',

    /** Suffix for all routes, i.e: .json.
     * No path separator is added between the route and the suffix */
    suffix: '',

    /** Function that transforms the path before finding a route */
    pathTransform: undefined,

    /** Enables automatic parameter validation */
    useValidation: true,

    /** Enables automatic serialization/deserialization */
    useSerialization: true,

    /** Default run type compiling options for routes and hooks, can't be configured by the user as would break functionality  */
    runTypeOptions: {
        /** Removes unknown properties when parsing parameters from json */
        strictJSON: false,

        /** skip first parameter (Context) from route/hook handlers */
        paramsSlice: {start: ROUTE_DEFAULT_PARAMS.length},
    },

    /** Custom body parser, defaults to Native JSON */
    bodyParser: JSON,

    /** set to true to generate router spec for clients.  */
    getPublicRoutesData: process.env.GENERATE_ROUTER_SPEC === 'true',

    /** Set true to automatically generate and id for every error.  */
    autoGenerateErrorId: false,

    /** client routes are initialized by default */
    skipClientRoutes: false || IS_TEST_ENV,
} satisfies Readonly<RouterOptions>;

export const MAX_ROUTE_NESTING = 10;
