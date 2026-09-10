/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Handler, HeaderHandler, RawMiddleFnHandler} from './handlers.ts';
import {HandlerType, type RtMarkerPayload} from '@mionjs/core';
import {HeadersMiddleFnOptions, MiddleFnOptions, RawMiddleFnOptions, RouteOptions} from './remoteMethods.ts';
import type {RouterOptions} from './general.ts';

// #######  Routes Definitions #######
// Flat interfaces on purpose: a definition type is instantiated on every route declaration, and a
// `Pick` over the method interface plus an intersection costs measurably more in the
// type-instantiation budget than naming the two fields.
//
// `RO` is the options literal the author wrote (what `options` holds at runtime) and `O` the router
// options the helper was created with. `O` rides as a type-only field: nothing sets it at runtime,
// it exists so `PublicApi` can resolve the effective options (route, then router, then default)
// the same way the router does, and a client build can read them off the API type.

/** The router options a definition was declared under, the widest shape by default. */
export type DeclaredRouterOptions = Partial<RouterOptions>;

// type-route-def-start
/** Route definition */
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

// type-middleFn-def-start
/** MiddleFn definition, a function that middleFns into the ExecutionChain */
export interface MiddleFnDef<
  H extends Handler = any,
  RO extends MiddleFnOptions = MiddleFnOptions,
  O extends DeclaredRouterOptions = DeclaredRouterOptions,
> {
  type: typeof HandlerType.middleFn;
  handler: H;
  options?: RO;
  /** build-time injected mion payload (filled by the middleFn() factory) */
  rtFns?: RtMarkerPayload;
  /** type-only: the router options this middleFn was declared under, never set at runtime */
  readonly routerOptions?: O;
}
// type-middleFn-def-end

// type-header-middleFn-def-start
/** Headers MiddleFn definition, used to handle header params */
export interface HeadersMiddleFnDef<
  H extends HeaderHandler = any,
  RO extends HeadersMiddleFnOptions = HeadersMiddleFnOptions,
  O extends DeclaredRouterOptions = DeclaredRouterOptions,
> {
  type: typeof HandlerType.headersMiddleFn;
  handler: H;
  options?: RO;
  /** build-time injected mion payload (filled by the headersFn() factory) */
  rtFns?: RtMarkerPayload;
  /** type-only: the router options this middleFn was declared under, never set at runtime */
  readonly routerOptions?: O;
}
// type-header-middleFn-def-end

// type-raw-middleFn-def-start
/**
 * Raw middleFn, used only to access raw request/response and modify the call context.
 * Can not declare extra parameters.
 */
export interface RawMiddleFnDef<H extends RawMiddleFnHandler = any> {
  type: typeof HandlerType.rawMiddleFn;
  handler: H;
  options?: RawMiddleFnOptions;
}
// type-raw-middleFn-def-end

export type AnyHandlerDef = RouteDef | MiddleFnDef | HeadersMiddleFnDef | RawMiddleFnDef;
