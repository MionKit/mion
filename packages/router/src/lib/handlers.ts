/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeadersMiddleFnOptions, MiddleFnOptions, RawMiddleFnOptions, RouteOptions} from '../types/remoteMethods.ts';
import {HandlerType} from '@mionkit/core';
import {Handler, HeaderHandler, RawMiddleFnHandler} from '../types/handlers.ts';
import {HeadersMiddleFnDef, MiddleFnDef, RawMiddleFnDef, RouteDef} from '../types/definitions.ts';

// ############# Route & MiddleFns initialization #############
// these functions are just helpers to initialize the route & middleFns objects and keep route definitions clean

export function route<H extends Handler>(handler: H, opts?: RouteOptions): RouteDef<H> {
    return {
        type: HandlerType.route,
        handler,
        options: opts,
    };
}

export function middleFn<H extends Handler>(handler: H, opts?: MiddleFnOptions): MiddleFnDef<H> {
    return {
        type: HandlerType.middleFn,
        handler,
        options: opts,
    };
}

/**
 * MiddleFn for handling HTTP header parameters
 * Used to define middleFns that receive values from HTTP headers
 *
 * @example
 * ```ts
 * headersFn(['authorization'], (ctx, token: string): void => {
 *   // token contains the value of the 'authorization' header
 * })
 * ```
 */
export function headersFn<H extends HeaderHandler>(handler: H, opts?: HeadersMiddleFnOptions): HeadersMiddleFnDef<H> {
    return {
        type: HandlerType.headersMiddleFn,
        handler,
        options: opts,
    };
}

export function rawMiddleFn<H extends RawMiddleFnHandler>(handler: H, opts?: RawMiddleFnOptions): RawMiddleFnDef<H> {
    return {
        type: HandlerType.rawMiddleFn,
        handler,
        options: opts,
    };
}
