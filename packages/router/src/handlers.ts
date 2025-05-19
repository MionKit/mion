/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeaderHookOptions, HookOptions, HandlerType, RawHookOptions, RouteOptions} from './types/procedures';
import {Handler, HeaderHandler, RawHookHandler} from './types/handlers';
import {HeaderHookDef, HookDef, RawHookDef, RouteDef} from './types/definitions';

// ############# Route & Hooks initialization #############
// these functions are just helpers to initialize the route & hooks objects and keep route definitions clean

export function route<H extends Handler>(handler: H, opts?: RouteOptions) {
    const procedure = {
        type: HandlerType.route,
        handler,
        options: opts,
    } satisfies RouteDef<H>;
    return procedure;
}

export function hook<H extends Handler>(handler: H, opts?: HookOptions) {
    const procedure = {
        type: HandlerType.hook,
        handler,
        options: opts,
    } satisfies HookDef<H>;
    return procedure;
}

export function headersHook<S extends string[], H extends HeaderHandler>(headerNames: S, handler: H, opts?: HeaderHookOptions) {
    if (headerNames.length !== handler.length - 1)
        throw new Error('Header Names must match the number of handler parameters minus the context parameter.');
    const procedure = {
        type: HandlerType.headerHook,
        headerNames,
        handler,
        options: opts,
    } satisfies HeaderHookDef<H>;
    return procedure;
}

export function rawHook<H extends RawHookHandler>(handler: H, opts?: RawHookOptions) {
    const procedure = {
        type: HandlerType.rawHook,
        handler,
        options: opts,
    } satisfies RawHookDef<H>;
    return procedure;
}
