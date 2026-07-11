/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Handler, HeaderHandler, RawMiddleFnHandler} from './handlers.ts';
import {
    HeadersMiddleFnOptions,
    HeadersMethod,
    MiddleFnOptions,
    MiddleFnMethod,
    RawMiddleFnOptions,
    RawMethod,
    RouteOptions,
    RouteMethod,
} from './remoteMethods.ts';

// #######  Routes Definitions #######

// type-route-def-start
/** Route definition */
export type RouteDef<H extends Handler = any> = Pick<RouteMethod<H>, 'type' | 'handler'> & {
    options?: RouteOptions;
};
// type-route-def-end

// type-middleFn-def-start
/** MiddleFn definition, a function that middleFns into the ExecutionChain */
export type MiddleFnDef<H extends Handler = any> = Pick<MiddleFnMethod<H>, 'type' | 'handler'> & {
    options?: MiddleFnOptions;
};
// type-middleFn-def-end

// type-header-middleFn-def-start
/** Headers MiddleFn definition, used to handle header params */
export type HeadersMiddleFnDef<H extends HeaderHandler = any> = Pick<HeadersMethod<H>, 'type' | 'handler'> & {
    options?: HeadersMiddleFnOptions;
};
// type-header-middleFn-def-end

// type-raw-middleFn-def-start
/**
 * Raw middleFn, used only to access raw request/response and modify the call context.
 * Can not declare extra parameters.
 */
export type RawMiddleFnDef<H extends RawMiddleFnHandler = any> = Pick<RawMethod<H>, 'type' | 'handler'> & {
    options?: RawMiddleFnOptions;
};
// type-raw-middleFn-def-end

export type AnyHandlerDef = RouteDef | MiddleFnDef | HeadersMiddleFnDef | RawMiddleFnDef;
