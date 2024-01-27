/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeaderSingleValue, HeaderValue} from './context';
import {HeaderHookDef, HookDef, RawHookDef, RouteDef} from './definitions';
import {Route, RouterEntry, Routes} from './general';
import {NotFoundProcedure} from './procedures';
import {RawProcedure} from './procedures';
import {HeaderProcedure} from './procedures';
import {RouteProcedure} from './procedures';
import {Procedure} from './procedures';
import {ProcedureType} from './procedures';

// #######  type guards #######

export function isRouteDef(entry: RouterEntry): entry is RouteDef {
    return entry.type === ProcedureType.route;
}

export function isHookDef(entry: RouterEntry): entry is HookDef {
    return entry.type === ProcedureType.hook;
}

export function isRawHookDef(entry: RouterEntry): entry is RawHookDef {
    return entry.type === ProcedureType.rawHook;
}

export function isHeaderHookDef(entry: RouterEntry): entry is HeaderHookDef {
    return entry.type === ProcedureType.headerHook;
}

export function isAnyHookDef(entry: RouterEntry): entry is HeaderHookDef | HookDef | RawHookDef {
    return isHookDef(entry) || isRawHookDef(entry) || isHeaderHookDef(entry);
}

export function isRoute(entry: RouterEntry): entry is Route {
    return entry.type === ProcedureType.route;
}

export function isRoutes(entry: RouterEntry | Routes): entry is Route {
    return typeof entry === 'object';
}

export function isExecutable(entry: Procedure | {pathPointer: string[]}): entry is Procedure {
    return (
        typeof (entry as Procedure)?.id === 'string' &&
        ((entry as any).routes === 'undefined' || typeof (entry as Procedure).handler === 'function')
    );
}
export function isRawExecutable(entry: Procedure): entry is RawProcedure {
    return entry.type === ProcedureType.rawHook;
}

export function isPublicExecutable(entry: Procedure): entry is Procedure {
    return entry.reflection?.canReturnData || !!entry.reflection?.paramsLength;
}

export function isNotFoundExecutable(entry: Procedure): entry is NotFoundProcedure {
    return (entry as NotFoundProcedure).is404;
}

export function isHeaderExecutable(entry: Procedure): entry is HeaderProcedure {
    return entry.type === ProcedureType.headerHook;
}

export function isRouteExecutable(entry: Procedure): entry is RouteProcedure {
    return entry.type === ProcedureType.route;
}

export function isSingleValueHeader(value: HeaderValue): value is HeaderSingleValue {
    return !Array.isArray(value);
}
