/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeadersMiddlewareDef, MiddlewareDef, RawMiddlewareDef, RouteDef} from './definitions.ts';
import {Route, RouterEntry, Routes} from './general.ts';
import {RawMethod} from './remoteMethods.ts';
import {HeadersMethod} from './remoteMethods.ts';
import {RouteMethod} from './remoteMethods.ts';
import {RemoteMethod} from './remoteMethods.ts';
import {HandlerType} from '@mionjs/core';

// #######  type guards #######

export function isRouteDef(entry: RouterEntry): entry is RouteDef {
  return entry.type === HandlerType.route;
}

export function isMiddlewareDef(entry: RouterEntry): entry is MiddlewareDef {
  return entry.type === HandlerType.middleware;
}

export function isRawMiddlewareDef(entry: RouterEntry): entry is RawMiddlewareDef {
  return entry.type === HandlerType.rawMiddleware;
}

export function isHeadersMiddlewareDef(entry: RouterEntry): entry is HeadersMiddlewareDef {
  return entry.type === HandlerType.headersMiddleware;
}

export function isAnyMiddlewareDef(entry: RouterEntry): entry is HeadersMiddlewareDef | MiddlewareDef | RawMiddlewareDef {
  return isMiddlewareDef(entry) || isRawMiddlewareDef(entry) || isHeadersMiddlewareDef(entry);
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
  return entry.type === HandlerType.rawMiddleware;
}

export function isPublicExecutable(entry: RemoteMethod): entry is RemoteMethod {
  return (
    entry.hasReturnData ||
    entry.type === HandlerType.route ||
    !!entry.paramsCount ||
    !!(entry as HeadersMethod).headersParam?.headerNames?.length
  );
}

export function isHeaderExecutable(entry: RemoteMethod): entry is HeadersMethod {
  return entry.type === HandlerType.headersMiddleware;
}

export function isRouteExecutable(entry: RemoteMethod): entry is RouteMethod {
  return entry.type === HandlerType.route;
}
