/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Handler, HeaderHandler, RawMiddleFnHandler} from './handlers.ts';
import {HandlerType, type RtMarkerPayload} from '@mionjs/core';
import {HeadersMiddleFnOptions, MiddleFnOptions, RawMiddleFnOptions, RouteOptions} from './remoteMethods.ts';

// #######  Routes Definitions #######
// Flat interfaces on purpose: a definition type is instantiated on every route declaration, and a
// `Pick` over the method interface plus an intersection costs measurably more in the
// type-instantiation budget than naming the two fields.

// type-route-def-start
/** Route definition */
export interface RouteDef<H extends Handler = any> {
  type: typeof HandlerType.route;
  handler: H;
  options?: RouteOptions;
  /** build-time injected mion payload (filled by the route()/query()/mutation() factories) */
  rtFns?: RtMarkerPayload;
}
// type-route-def-end

// type-middleFn-def-start
/** MiddleFn definition, a function that middleFns into the ExecutionChain */
export interface MiddleFnDef<H extends Handler = any> {
  type: typeof HandlerType.middleFn;
  handler: H;
  options?: MiddleFnOptions;
  /** build-time injected mion payload (filled by the middleFn() factory) */
  rtFns?: RtMarkerPayload;
}
// type-middleFn-def-end

// type-header-middleFn-def-start
/** Headers MiddleFn definition, used to handle header params */
export interface HeadersMiddleFnDef<H extends HeaderHandler = any> {
  type: typeof HandlerType.headersMiddleFn;
  handler: H;
  options?: HeadersMiddleFnOptions;
  /** build-time injected mion payload (filled by the headersFn() factory) */
  rtFns?: RtMarkerPayload;
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
