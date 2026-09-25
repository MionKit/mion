/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Prettify, RpcError, MethodMetadata, RemoteMethodOpts} from '@mionjs/core';
import type {ResolvedMiddlewareOptions, ResolvedRouteOptions} from './resolvedOptions.ts';
import type {ParamsStrategy, ReturnStrategy, WireFormat} from './parser.ts';
import type {CallContext} from './context.ts';
import type {Routes} from './general.ts';
import type {
  Handler,
  HeaderHandler,
  HandlerIsAsync,
  HandlerParams,
  HandlerReturn,
  HeaderHandlerHeaders,
  HeaderHandlerParams,
} from './handlers.ts';
import type {HeadersMiddlewareDef, MiddlewareDef, RawMiddlewareDef} from './definitions.ts';
import {HandlerType} from '@mionjs/core'; // do not import type only

// ####### Raw Middlewares #######

/** A raw middleware cannot declare a return type, so an error it returns is undeclared: it ends the
 *  request and reaches the client untyped, exactly like a thrown one. */
export type MayReturnError = void | RpcError<string> | Promise<RpcError<string> | void>;

export type MiddlewaresCollection = {
  [key: string]: MiddlewareDef | HeadersMiddlewareDef | RawMiddlewareDef;
};

// ####### Private Middlewares #######

export interface PrivateMiddlewareDef extends MiddlewareDef {
  handler: (ctx?: any) => void | never | undefined;
}

export type PrivateDef = PrivateMiddlewareDef | RawMiddlewareDef;

// ####### Remote Methods Metadata #######

/** Public routes & middleware; private and raw middleware are dropped.
 *  Each public method carries its EFFECTIVE options (route, then router, then default), the values
 *  `initRoutes` returns at runtime and a client build reads off this type. */
// prettier-ignore
export type PublicApi<Type extends Routes> = Prettify<{
    [Property in keyof Type as Type[Property] extends PrivateDef ? never : Property]
    : Type[Property] extends {type: typeof HandlerType.route; handler: infer H extends Handler; options?: infer RO; routerOptions?: infer O}
    ? PublicRoute<PublicHandler<H>, ResolvedRouteOptions<RO, O>, HandlerMethodTypes<H, RO, O>>
    : Type[Property] extends {type: typeof HandlerType.headersMiddleware; handler: infer H extends HeaderHandler; options?: infer RO; routerOptions?: infer O}
    ? PublicHeadersFn<PublicHandler<H>, ResolvedMiddlewareOptions<RO, O>, HeadersHandlerMethodTypes<H, RO, O>>
    : Type[Property] extends {type: typeof HandlerType.middleware; handler: infer H extends Handler; options?: infer RO; routerOptions?: infer O}
    ? PublicMiddleware<PublicHandler<H>, ResolvedMiddlewareOptions<RO, O>, HandlerMethodTypes<H, RO, O>>
        : Type[Property] extends Routes // Routes & PureRoutes (recursion)
        ? PublicApi<Type[Property]>
        : never;
}>;

// type-remote-api-start
/** Same as PublicApi but with no type mapping, for when strong types are not required. */
export type RemoteApi = {
  [key: string]: PublicRoute<any, any, any> | PublicMiddleware<any, any, any> | PublicHeadersFn<any, any, any> | RemoteApi;
};
// type-remote-api-end

/** The types the server compiled a method's validators and serializers from: the same aliases the route
 *  helpers hand to their markers, so a client build with `bundleApi` compiles the same functions under the
 *  same ids. Type-only: never set at runtime. */
export interface MethodTypes {
  /** the params tuple the server validates (a headers middleware's start after its HeadersSubset) */
  params: unknown;
  /** the awaited return type, declared errors included */
  return: unknown;
  /** a headers middleware's HeadersSubset parameter, `never` for every other method */
  headers: unknown;
  isAsync: boolean;
  /** the sync id's type: written like the syncId slot of MarkerSlots */
  sync: unknown;
}

/** An interface on purpose: its members resolve only when read, so an API type carrying it costs a client nothing. */
export interface HandlerMethodTypes<H extends Handler, RO = unknown, O = unknown> {
  params: HandlerParams<H>;
  return: HandlerReturn<H>;
  headers: never;
  isAsync: HandlerIsAsync<H>;
  sync: [HandlerParams<H>, HandlerReturn<H>, WireFormat<ParamsStrategy<RO, O>>, WireFormat<ReturnStrategy<RO, O>>];
}

/** The MethodTypes of a headers middleware handler: params after its HeadersSubset, which rides `headers`. */
export interface HeadersHandlerMethodTypes<H extends HeaderHandler, RO = unknown, O = unknown> {
  params: HeaderHandlerParams<H>;
  return: HandlerReturn<H>;
  headers: HeaderHandlerHeaders<H>;
  isAsync: HandlerIsAsync<H>;
  sync: [HeaderHandlerParams<H>, HandlerReturn<H>, WireFormat<ParamsStrategy<RO, O>>, WireFormat<ReturnStrategy<RO, O>>];
}

/** Public Route: the same handler without the context parameter */
export interface PublicRoute<H extends Handler = any, Opts = RemoteMethodOpts, Types = MethodTypes> extends MethodMetadata {
  type: typeof HandlerType.route;
  middlewareIds: string[];
  headerNames: undefined;
  handler: H;
  /** the effective options, as the router resolved them */
  options: Opts;
  /** type-only: the types the server compiled this route from, see MethodTypes */
  readonly types?: Types;
}

/** Public Middleware: the same handler without the context parameter */
export interface PublicMiddleware<H extends Handler = any, Opts = RemoteMethodOpts, Types = MethodTypes> extends MethodMetadata {
  type: typeof HandlerType.middleware;
  handler: H;
  /** the effective options, as the router resolved them */
  options: Opts;
  /** type-only: the types the server compiled this middleware from, see MethodTypes */
  readonly types?: Types;
}

/** Public HeadersFn: the same handler without the context parameter */
export interface PublicHeadersFn<H extends Handler = any, Opts = RemoteMethodOpts, Types = MethodTypes> extends MethodMetadata {
  type: typeof HandlerType.headersMiddleware;
  headerNames: string[];
  handler: H;
  /** the effective options, as the router resolved them */
  options: Opts;
  /** type-only: the types the server compiled this middleware from, see MethodTypes */
  readonly types?: Types;
}

/** Removes the context from handlers */
// prettier-ignore
export type PublicHandler<H extends Handler> =
    H extends (ctx: CallContext, ...rest: infer Req) => infer Resp
    ? (...rest: Req) => Promise<Awaited<Resp>>
    : never;
