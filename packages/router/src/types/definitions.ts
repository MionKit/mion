/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Handler, HeaderHandler, RawLinkedFnHandler} from './handlers.ts';
import {
    HeadersLinkedFnOptions,
    HeadersMethod,
    LinkedFnOptions,
    LinkedFnMethod,
    RawLinkedFnOptions,
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

// type-linkedFn-def-start
/** LinkedFn definition, a function that linkedFns into the ExecutionChain */
export type LinkedFnDef<H extends Handler = any> = Pick<LinkedFnMethod<H>, 'type' | 'handler'> & {
    options?: LinkedFnOptions;
};
// type-linkedFn-def-end

// type-header-linkedFn-def-start
/** Headers LinkedFn definition, used to handle header params */
export type HeadersLinkedFnDef<H extends HeaderHandler = any> = Pick<HeadersMethod<H>, 'type' | 'handler'> & {
    options?: HeadersLinkedFnOptions;
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

export type AnyHandlerDef = RouteDef | LinkedFnDef | HeadersLinkedFnDef | RawLinkedFnDef;
