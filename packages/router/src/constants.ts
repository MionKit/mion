/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Executable, Hook, Logger, MkRequest, RouteObject, RouterOptions} from './types';

const noop = (...args) => {};

export const ROUTE_PATH_ROOT = '/';

export const DEFAULT_ROUTE: Readonly<Required<RouteObject>> = {
    path: '',
    description: '',
    route: () => null,
};
export const DEFAULT_HOOK: Readonly<Required<Hook>> = {
    forceRunOnError: false,
    canReturnData: false,
    inHeader: false,
    fieldName: '',
    description: '',
    hook: () => null,
};

export const DEFAULT_EXECUTABLE: Readonly<Required<Executable>> = {
    path: '',
    nestLevel: 0,
    forceRunOnError: false,
    canReturnData: false,
    inHeader: false,
    fieldName: '',
    isRoute: false,
    handler: () => null,
    paramValidators: [],
    paramsDeSerializers: [],
    outputSerializer: (a: any) => null as any,
    src: null as any,
};

export const DEFAULT_REQUEST: Readonly<Required<MkRequest>> = {
    headers: {},
    body: '{}',
};

export const SILENT_LOGGER: Readonly<Logger> = {
    fatal: noop,
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    child: noop,
    log: noop,
};

export const CONSOLE_LOGGER: Logger = {
    ...console,
    fatal: (...args) => console.error(...args),
    isConsoleLog: true,
};

export const IS_TEST_ENV = process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';

export const DEFAULT_LOGGER = IS_TEST_ENV ? SILENT_LOGGER : CONSOLE_LOGGER;

export const DEFAULT_ROUTE_OPTIONS: Readonly<RouterOptions> = {
    /** prefix for all routes, i.e: api/v1.
     * path separator is added between the prefix and the route */
    prefix: '',

    /** suffix for all routes, i.e: .json.
     * Not path separators is added between the route and the suffix */
    suffix: '',

    /** Transform the path before finding a route */
    pathTransform: undefined,

    /** configures the fieldName in the request/response body used for a route's params/response */
    routeFieldName: undefined,

    /** Enables automatic parameter validation */
    enableValidation: true,

    /** Enables automatic serialization/deserialization */
    enableSerialization: true,

    /**
     * Deepkit Serialization Options
     * loosely defaults to false, Soft conversion disabled.
     * !! We Don't recommend to enable soft conversion as validation might fail
     * */
    serializationOptions: {
        loosely: false,
    },

    /**
     * Deepkit custom serializer
     * @link https://docs.deepkit.io/english/serialization.html#serialisation-custom-serialiser
     * */
    customSerializer: undefined,

    /**
     * Deepkit Serialization Options
     * @link https://docs.deepkit.io/english/serialization.html#_naming_strategy
     * */
    serializerNamingStrategy: undefined,

    /** Custom JSON parser, defaults to Native js JSON */
    jsonParser: JSON,

    /**
     * Logger Interface Based on abstract-logging
     * @default console
     * @link https://www.npmjs.com/package/abstract-logging */
    logger: DEFAULT_LOGGER,

    /** disables logs completely, silent is enabled by default for Jest or when NODE_ENV = 'test */
    silent: IS_TEST_ENV,
};

export const ROUTE_KEYS = Object.keys(DEFAULT_ROUTE);
export const HOOK_KEYS = Object.keys(DEFAULT_HOOK);

export const MAX_ROUTE_NESTING = 10;
