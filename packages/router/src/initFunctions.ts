/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RouteDef, HookDef, HeaderHookDef, RawHookDef} from './types/definitions';
import type {Handler, HeaderHandler, RawHookHandler} from './types/handlers';

// ############# Route & Hooks initialization #############
// these functions are just helpers to initialize the route & hooks objects and keep route definitions clean

export function route<const H extends Handler, const Def extends Omit<RouteDef, 'route'> | undefined>(
    handler: H,
    routeDef?: Def
) {
    return {...routeDef, route: handler};
}

export function hook<const H extends Handler, const Def extends Omit<HookDef, 'hook'> | undefined>(handler: H, hookDef?: Def) {
    const a = {...hookDef, hook: handler};
    return a;
}

export function headersHook<
    const S extends string,
    const H extends HeaderHandler,
    const Def extends Omit<HeaderHookDef, 'hook' | 'headerName'> | undefined,
>(headerName: S, handler: H, hookDef?: Def) {
    return {...hookDef, headerName, hook: handler};
}

export function rawHook<const H extends RawHookHandler, Def extends Omit<RawHookDef, 'hook' | 'isRawHook'> | undefined>(
    handler: H,
    hookDef?: Def
) {
    return {...hookDef, hook: handler, isRawHook: true};
}
