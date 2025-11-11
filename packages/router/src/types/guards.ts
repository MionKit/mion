/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeaderHookDef, HookDef, RawHookDef, RouteDef} from './definitions';
import {Route, RouterEntry, Routes} from './general';
import {NotFoundMethod} from './remoteMethods';
import {RawMethod} from './remoteMethods';
import {HeaderMethod} from './remoteMethods';
import {RouteMethod} from './remoteMethods';
import {Method} from './remoteMethods';
import {HandlerType} from './remoteMethods';

// #######  type guards #######

export function isRouteDef(entry: RouterEntry): entry is RouteDef {
    return entry.type === HandlerType.route;
}

export function isHookDef(entry: RouterEntry): entry is HookDef {
    return entry.type === HandlerType.hook;
}

export function isRawHookDef(entry: RouterEntry): entry is RawHookDef {
    return entry.type === HandlerType.rawHook;
}

export function isHeaderHookDef(entry: RouterEntry): entry is HeaderHookDef {
    return entry.type === HandlerType.headerHook;
}

export function isAnyHookDef(entry: RouterEntry): entry is HeaderHookDef | HookDef | RawHookDef {
    return isHookDef(entry) || isRawHookDef(entry) || isHeaderHookDef(entry);
}

export function isRoute(entry: RouterEntry): entry is Route {
    return entry.type === HandlerType.route;
}

export function isRoutes(entry: RouterEntry | Routes): entry is Route {
    return typeof entry === 'object';
}

export function isExecutable(entry: Method | {pathPointer: string[]}): entry is Method {
    return (
        typeof (entry as Method)?.id === 'string' &&
        ((entry as any).routes === 'undefined' || typeof (entry as Method).handler === 'function')
    );
}
export function isRawExecutable(entry: Method): entry is RawMethod {
    return entry.type === HandlerType.rawHook;
}

export function isPublicExecutable(entry: Method): entry is Method {
    return entry.hasReturnData || entry.type === HandlerType.route || !!entry.paramNames?.length;
}

export function isNotFoundExecutable(entry: Method): entry is NotFoundMethod {
    return (entry as NotFoundMethod).is404;
}

export function isHeaderExecutable(entry: Method): entry is HeaderMethod {
    return entry.type === HandlerType.headerHook;
}

export function isRouteExecutable(entry: Method): entry is RouteMethod {
    return entry.type === HandlerType.route;
}
