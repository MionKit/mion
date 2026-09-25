/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Handler, HeaderHandler, RawMiddlewareHandler} from './handlers.ts';
import {HandlerType, type RtMarkerPayload} from '@mionjs/core';
import {HeadersMiddlewareOptions, MiddlewareOptions, RawMiddlewareOptions, RouteOptions} from './remoteMethods.ts';
import type {RouterOptions} from './general.ts';

// #######  Routes Definitions #######
// Flat interfaces on purpose: a definition type is instantiated on every route declaration, and a
// `Pick` plus intersection costs measurably more in the type-instantiation budget.
// `RO` is the options literal the author wrote, `O` the router options the helper was created with.
// `O` is type-only, so `PublicApi` can resolve the effective options (route, router, default) the
// same way the router does and a client build reads them off the API type.

/** The router options a definition was declared under, the widest shape by default. */
export type DeclaredRouterOptions = Partial<RouterOptions>;

// type-route-def-start
export interface RouteDef<
  H extends Handler = any,
  RO extends RouteOptions = RouteOptions,
  O extends DeclaredRouterOptions = DeclaredRouterOptions,
> {
  type: typeof HandlerType.route;
  handler: H;
  options?: RO;
  /** build-time injected mion payload (filled by the route()/query()/mutation() factories) */
  rtFns?: RtMarkerPayload;
  /** type-only: the router options this route was declared under, never set at runtime */
  readonly routerOptions?: O;
}
// type-route-def-end

// type-middleware-def-start
/** Middleware definition: a step that runs in the ExecutionChain around the route. */
export interface MiddlewareDef<
  H extends Handler = any,
  RO extends MiddlewareOptions = MiddlewareOptions,
  O extends DeclaredRouterOptions = DeclaredRouterOptions,
> {
  type: typeof HandlerType.middleware;
  handler: H;
  options?: RO;
  /** build-time injected mion payload (filled by the middleware() factory) */
  rtFns?: RtMarkerPayload;
  /** type-only: the router options this middleware was declared under, never set at runtime */
  readonly routerOptions?: O;
}
// type-middleware-def-end

// type-header-middleware-def-start
/** Headers Middleware definition, used to handle header params */
export interface HeadersMiddlewareDef<
  H extends HeaderHandler = any,
  RO extends HeadersMiddlewareOptions = HeadersMiddlewareOptions,
  O extends DeclaredRouterOptions = DeclaredRouterOptions,
> {
  type: typeof HandlerType.headersMiddleware;
  handler: H;
  options?: RO;
  /** build-time injected mion payload (filled by the headersFn() factory) */
  rtFns?: RtMarkerPayload;
  /** type-only: the router options this middleware was declared under, never set at runtime */
  readonly routerOptions?: O;
}
// type-header-middleware-def-end

// type-raw-middleware-def-start
/** Raw middleware: raw request/response access and call-context changes only, no extra parameters. */
export interface RawMiddlewareDef<H extends RawMiddlewareHandler = any> {
  type: typeof HandlerType.rawMiddleware;
  handler: H;
  options?: RawMiddlewareOptions;
}
// type-raw-middleware-def-end

export type AnyHandlerDef = RouteDef | MiddlewareDef | HeadersMiddlewareDef | RawMiddlewareDef;
