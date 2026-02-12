/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeadersLinkedFnDef, LinkedFnDef, RawLinkedFnDef, RouteDef} from './definitions.ts';
import {Route, RouterEntry, Routes} from './general.ts';
import {RawMethod} from './remoteMethods.ts';
import {HeadersMethod} from './remoteMethods.ts';
import {RouteMethod} from './remoteMethods.ts';
import {RemoteMethod} from './remoteMethods.ts';
import {HandlerType} from '@mionkit/core';

// #######  type guards #######

export function isRouteDef(entry: RouterEntry): entry is RouteDef {
    return entry.type === HandlerType.route;
}

export function isLinkedFnDef(entry: RouterEntry): entry is LinkedFnDef {
    return entry.type === HandlerType.linkedFn;
}

export function isRawLinkedFnDef(entry: RouterEntry): entry is RawLinkedFnDef {
    return entry.type === HandlerType.rawLinkedFn;
}

export function isHeadersLinkedFnDef(entry: RouterEntry): entry is HeadersLinkedFnDef {
    return entry.type === HandlerType.headersLinkedFn;
}

export function isAnyLinkedFnDef(entry: RouterEntry): entry is HeadersLinkedFnDef | LinkedFnDef | RawLinkedFnDef {
    return isLinkedFnDef(entry) || isRawLinkedFnDef(entry) || isHeadersLinkedFnDef(entry);
}

export function isRoute(entry: RouterEntry): entry is Route {
    return entry.type === HandlerType.route;
}

export function isRoutes(entry: RouterEntry | Routes): entry is Route {
    return typeof entry === 'object';
}

export function isExecutable(entry: RemoteMethod | {pathPointer: string[]}): entry is RemoteMethod {
    return (
        typeof (entry as RemoteMethod)?.id === 'string' &&
        ((entry as any).routes === 'undefined' || typeof (entry as RemoteMethod).handler === 'function')
    );
}
export function isRawExecutable(entry: RemoteMethod): entry is RawMethod {
    return entry.type === HandlerType.rawLinkedFn;
}

export function isPublicExecutable(entry: RemoteMethod): entry is RemoteMethod {
    return (
        entry.hasReturnData ||
        entry.type === HandlerType.route ||
        !!entry.paramNames?.length ||
        !!(entry as HeadersMethod).headersParam?.headerNames?.length
    );
}

export function isHeaderExecutable(entry: RemoteMethod): entry is HeadersMethod {
    return entry.type === HandlerType.headersLinkedFn;
}

export function isRouteExecutable(entry: RemoteMethod): entry is RouteMethod {
    return entry.type === HandlerType.route;
}
