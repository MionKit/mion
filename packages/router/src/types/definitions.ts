/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Handler, HeaderHandler, RawLinkedFnHandler} from './handlers';
import {
    HeaderLinkedFnOptions,
    HeaderMethod,
    LinkedFnOptions,
    LinkedFnMethod,
    RawLinkedFnOptions,
    RawMethod,
    RouteOptions,
    RouteMethod,
} from './remoteMethods';

// #######  Routes Definitions #######

// type-route-def-start
/** Route definition */
export type RouteDef<H extends Handler = any> = Pick<RouteMethod<H>, 'type' | 'handler'> & {
    options?: RouteOptions;
};
// type-route-def-end

// type-linkedFn-def-start
/** LinkedFn definition, a function that linkedFns into the execution path */
export type LinkedFnDef<H extends Handler = any> = Pick<LinkedFnMethod<H>, 'type' | 'handler'> & {
    options?: LinkedFnOptions;
};
// type-linkedFn-def-end

// type-header-linkedFn-def-start
/** Header LinkedFn definition, used to handle header params */
export type HeaderLinkedFnDef<H extends HeaderHandler = any> = Pick<HeaderMethod<H>, 'type' | 'handler'> & {
    options?: HeaderLinkedFnOptions;
};
// type-header-linkedFn-def-end

// type-raw-linkedFn-def-start
/**
 * Raw linkedFn, used only to access raw request/response and modify the call context.
 * Can not declare extra parameters.
 */
export type RawLinkedFnDef<H extends RawLinkedFnHandler = any> = Pick<RawMethod<H>, 'type' | 'handler'> & {
    options?: RawLinkedFnOptions;
};
// type-raw-linkedFn-def-end

export type AnyHandlerDef = RouteDef | LinkedFnDef | HeaderLinkedFnDef | RawLinkedFnDef;
