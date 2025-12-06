/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeaderHookOptions, HookOptions, RawHookOptions, RouteOptions} from '../types/remoteMethods';
import {HandlerType} from '@mionkit/core';
import {Handler, HeaderHandler, RawHookHandler} from '../types/handlers';
import {HeaderHookDef, HookDef, RawHookDef, RouteDef} from '../types/definitions';

// ############# Route & Hooks initialization #############
// these functions are just helpers to initialize the route & hooks objects and keep route definitions clean

export function route<H extends Handler>(handler: H, opts?: RouteOptions): RouteDef<H> {
    return {
        type: HandlerType.route,
        handler,
        options: opts,
    };
}

export function hook<H extends Handler>(handler: H, opts?: HookOptions): HookDef<H> {
    return {
        type: HandlerType.hook,
        handler,
        options: opts,
    };
}

/**
 * Hook for handling HTTP header parameters
 * Used to define hooks that receive values from HTTP headers
 *
 * @example
 * ```ts
 * headersHook(['authorization'], (ctx, token: string): void => {
 *   // token contains the value of the 'authorization' header
 * })
 * ```
 */
export function headersHook<H extends HeaderHandler>(handler: H, opts?: HeaderHookOptions): HeaderHookDef<H> {
    return {
        type: HandlerType.headerHook,
        handler,
        options: opts,
    };
}

export function rawHook<H extends RawHookHandler>(handler: H, opts?: RawHookOptions): RawHookDef<H> {
    return {
        type: HandlerType.rawHook,
        handler,
        options: opts,
    };
}
