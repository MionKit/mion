/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeaderSingleValue, HeaderValue} from './context';
import {HeaderHookDef, HookDef, RawHookDef, RouteDef} from './definitions';
import {
    Executable,
    HookHeaderExecutable,
    NotFoundExecutable,
    RawExecutable,
    Route,
    RouteExecutable,
    RouterEntry,
    Routes,
} from './general';
import {Handler} from './handlers';

// #######  type guards #######

export function isHandler(entry: RouterEntry): entry is Handler {
    return typeof entry === 'function';
}

export function isRouteDef(entry: RouterEntry): entry is RouteDef {
    return typeof (entry as RouteDef).route === 'function';
}

export function isHookDef(entry: RouterEntry): entry is HookDef {
    return typeof (entry as HookDef).hook === 'function';
}

export function isRawHookDef(entry: RouterEntry): entry is RawHookDef {
    return typeof (entry as RawHookDef).hook === 'function' && (entry as RawHookDef).isRawHook;
}

export function isHeaderHookDef(entry: RouterEntry): entry is HeaderHookDef {
    return typeof (entry as HeaderHookDef).hook === 'function' && typeof (entry as HeaderHookDef).headerName !== 'undefined';
}

export function isAnyHookDef(entry: RouterEntry): entry is HeaderHookDef | HookDef | RawHookDef {
    return isHookDef(entry) || isRawHookDef(entry) || isHeaderHookDef(entry);
}

export function isRoute(entry: RouterEntry): entry is Route {
    return typeof entry === 'function' || typeof (entry as RouteDef).route === 'function';
}

export function isRoutes(entry: RouterEntry | Routes): entry is Route {
    return typeof entry === 'object';
}

export function isExecutable(entry: Executable | {pathPointer: string[]}): entry is Executable {
    return (
        typeof (entry as Executable)?.id === 'string' &&
        ((entry as any).routes === 'undefined' || typeof (entry as Executable).handler === 'function')
    );
}
export function isRawExecutable(entry: Executable): entry is RawExecutable {
    return entry.isRawExecutable;
}

export function isPublicExecutable(entry: Executable): entry is Executable {
    return entry.reflection?.canReturnData || !!entry.reflection?.paramsLength;
}

export function isNotFoundExecutable(entry: Executable): entry is NotFoundExecutable {
    return (entry as NotFoundExecutable).is404;
}

export function isHeaderExecutable(entry: Executable): entry is HookHeaderExecutable {
    return entry.inHeader;
}

export function isRouteExecutable(entry: Executable): entry is RouteExecutable {
    return entry.isRoute;
}

export function isSingleValueHeader(value: HeaderValue): value is HeaderSingleValue {
    return !Array.isArray(value);
}
