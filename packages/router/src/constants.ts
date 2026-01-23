/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RouterOptions} from './types/general';
import {getENV, MION_ROUTES, PATH_SEPARATOR} from '@mionkit/core';

export const IS_TEST_ENV = getENV('JEST_WORKER_ID') !== undefined || getENV('NODE_ENV') === 'test';

export const ROUTE_DEFAULT_PARAMS = ['context'];
export const HEADER_HOOK_DEFAULT_PARAMS = ['context', 'headers'];

export const DEFAULT_ROUTE_OPTIONS = {
    /** Prefix for all routes, i.e: api/v1. Path separator is added between the prefix and the route */
    prefix: '',
    /** Suffix for all routes, i.e: .json. No path separator is added between the route and the suffix */
    suffix: '',
    /** Function that transforms the path before finding a route */
    pathTransform: undefined,
    /** Default serializer mode - use stringifyJson for optimized JSON serialization */
    serialize: 'stringifyJson',
    /** Default run type compiling options for routes and hooks, can't be configured by the user as would break functionality  */
    runTypeOptions: {},
    /** set to true to generate router spec for clients.  */
    getPublicRoutesData: process.env.GENERATE_ROUTER_SPEC === 'true',
    /** Set true to automatically generate and id for every error.  */
    autoGenerateErrorId: false,
    /** client routes are initialized by default */
    skipClientRoutes: false || IS_TEST_ENV,
    /** AOT mode is disabled by default */
    aot: false,
} as Readonly<RouterOptions>;

export const MAX_ROUTE_NESTING = 10;
export const NOT_FOUND_HOOK_NAME = '_miΦn404NΦtfΦundHΦΦk_';
export const NOT_FOUND_PATH = `${PATH_SEPARATOR}${MION_ROUTES.notFound}`;
