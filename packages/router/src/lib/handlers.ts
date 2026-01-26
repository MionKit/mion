/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeadersLinkedFnOptions, LinkedFnOptions, RawLinkedFnOptions, RouteOptions} from '../types/remoteMethods';
import {HandlerType} from '@mionkit/core';
import {Handler, HeaderHandler, RawLinkedFnHandler} from '../types/handlers';
import {HeadersLinkedFnDef, LinkedFnDef, RawLinkedFnDef, RouteDef} from '../types/definitions';

// ############# Route & LinkedFns initialization #############
// these functions are just helpers to initialize the route & linkedFns objects and keep route definitions clean

export function route<H extends Handler>(handler: H, opts?: RouteOptions): RouteDef<H> {
    return {
        type: HandlerType.route,
        handler,
        options: opts,
    };
}

export function linkedFn<H extends Handler>(handler: H, opts?: LinkedFnOptions): LinkedFnDef<H> {
    return {
        type: HandlerType.linkedFn,
        handler,
        options: opts,
    };
}

/**
 * LinkedFn for handling HTTP header parameters
 * Used to define linkedFns that receive values from HTTP headers
 *
 * @example
 * ```ts
 * headersFn(['authorization'], (ctx, token: string): void => {
 *   // token contains the value of the 'authorization' header
 * })
 * ```
 */
export function headersFn<H extends HeaderHandler>(handler: H, opts?: HeadersLinkedFnOptions): HeadersLinkedFnDef<H> {
    return {
        type: HandlerType.headersLinkedFn,
        handler,
        options: opts,
    };
}

export function rawLinkedFn<H extends RawLinkedFnHandler>(handler: H, opts?: RawLinkedFnOptions): RawLinkedFnDef<H> {
    return {
        type: HandlerType.rawLinkedFn,
        handler,
        options: opts,
    };
}
