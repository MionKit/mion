// ####### Executables #######

import type {ParserOption, HeadersMethodWithJitFns, MethodWithJitFns, RemoteMethodOpts, RouteOnlyOptions} from '@mionjs/core'; // do not import type only
import type {AnyHandler, Handler, HeaderHandler, RawMiddlewareHandler} from './handlers.ts'; // do not import type only
import {HandlerType} from '@mionjs/core'; // do not import type only

/** Contains the handlers for middlewares and routes */
export interface RemoteMethod<H extends AnyHandler = AnyHandler> extends MethodWithJitFns {
  options: RemoteMethodOpts;
  handler: H;
  /** The caller for this method's kind, resolved when the method is registered. Flat on purpose:
   *  the dispatch loop runs for every chain member of every request. */
  methodCaller: (...args: any[]) => any;
  /** `options.alwaysRun`, flattened for the same reason: the loop reads it once per member. */
  alwaysRun: boolean;
  /** `JSON.stringify(id)`, the method's own key as it is written into the response body. Constant
   *  per method, and the JSON serializer wrote it out again for every member of every request. */
  quotedId: string;
  /** Set the first time a method marked synchronous actually runs, once its returned value has been
   *  checked for being a promise. See the guard in `runExecutionChain`. */
  asyncChecked?: boolean;
}

export interface RouteMethod<H extends Handler = any> extends RemoteMethod<H> {
  type: typeof HandlerType.route;
  options: RouteOnlyOptions;
}
export interface MiddlewareMethod<H extends Handler = any> extends RemoteMethod<H> {
  type: typeof HandlerType.middleware;
}
export interface HeadersMethod<H extends HeaderHandler = any> extends RemoteMethod<H> {
  type: typeof HandlerType.headersMiddleware;
  headersParam: HeadersMethodWithJitFns;
}
export interface RawMethod<H extends RawMiddlewareHandler = any> extends RemoteMethod<H> {
  type: typeof HandlerType.rawMiddleware;
  options: RemoteMethodOpts & {
    validateParams: false;
    validateReturn?: false;
  };
}

// `parser` is a BUILD-TIME literal, inline or an `as const` preset, or the build reports CTA001 / CTA004.
// An unset direction falls back to the router-wide value, then to the built-in default.
// Flat interfaces on purpose: a mapped or intersected shape costs measurably more in the
// type-instantiation budget, paid on every route declaration.
interface RouteOptionsBase {
  description?: string;
  validateParams?: boolean;
  validateReturn?: boolean;
  /** Whether this route mutates data (query / mutation set it, route leaves it undefined). */
  isMutation?: boolean | undefined;
  sanitizeParams?: boolean;
  /** Largest request body this route accepts, in bytes. Wins over the number derived from the
   *  types and over the router option. */
  maxBodySize?: number;
}
interface MiddlewareOptionsBase {
  description?: string;
  validateParams?: boolean;
  /** This middleware's contribution to the request limit of every chain it sits in, in bytes, for a
   *  middleware whose params type has no maximum (a plain `string[]`). Without it such a middleware
   *  sends every chain it sits in to the router default. */
  maxBodySize?: number;
  validateReturn?: boolean;
  alwaysRun?: boolean;
  sanitizeParams?: boolean;
}
// ####### Route options never inherit the router options #######
// These types describe what a developer WRITES on one route. They take no router-options type
// parameter and MUST NOT gain one: a route overriding `{params: 'compact'}` would stop type-checking
// against a router set to `clone`, and a parameterised `RouteOptions<RouterOpts>` would be a fresh
// instantiation paid on EVERY route declaration, the exact cost the type budget tracks.
// Inheritance lives in the two readers instead: the marker slot types (types/parser.ts) and
// `resolveParser` at runtime (router.ts).
export interface PlainRouteOptions extends RouteOptionsBase {
  parser?: never;
}
export interface RouteOptionsWithParser extends RouteOptionsBase {
  parser: ParserOption;
}
export type RouteOptions = PlainRouteOptions | RouteOptionsWithParser;
export interface PlainMiddlewareOptions extends MiddlewareOptionsBase {
  parser?: never;
}
export interface MiddlewareOptionsWithParser extends MiddlewareOptionsBase {
  parser: ParserOption;
}
export type MiddlewareOptions = PlainMiddlewareOptions | MiddlewareOptionsWithParser;
export type PlainHeadersMiddlewareOptions = PlainMiddlewareOptions;
export type HeadersMiddlewareOptions = MiddlewareOptions;
// RawMiddlewareOptions doesn't need encoding - raw middlewares handle their own serialization
export type RawMiddlewareOptions = Partial<Pick<RawMethod['options'], 'description' | 'alwaysRun'>>;

export interface MethodsExecutionChain {
  /** -1 on routeless not-found chains; a `methods[routeIndex]` reader must skip them (maxBodySize cap, body parser do). */
  routeIndex: number;
  methods: RemoteMethod[];
  /** The exact transformed path, the Map key a request resolves by.
   *  Undefined on not-found and merged batch chains, which serve many paths and take the request's. */
  path?: string;
  /** Batch id and route ids in call order; constant per merged chain, so kept here, not copied per request. */
  batchId?: string;
  batchRouteIds?: string[];
  /** Bytes the route option or params types settled, undefined if they could not; read only by the platform cap. */
  declaredBodySize?: number;
  /** What a request is read against: `declaredBodySize`, else the adapter's; refreshed when either moves. */
  maxBodySize: number;
  /** False only on not-found chains: no route to feed, so neither the adapter reads the body nor the router parses it. */
  readsBody: boolean;
}
