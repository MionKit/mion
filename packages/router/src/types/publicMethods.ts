/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Prettify, RpcError, MethodMetadata, RemoteMethodOpts} from '@mionjs/core';
import type {ResolvedMiddleFnOptions, ResolvedRouteOptions} from './resolvedOptions.ts';
import type {CallContext} from './context.ts';
import type {Routes} from './general.ts';
import type {Handler} from './handlers.ts';
import type {HeadersMiddleFnDef, MiddleFnDef, RawMiddleFnDef, RouteDef} from './definitions.ts';
import {HandlerType} from '@mionjs/core'; // do not import type only

// ####### Raw MiddleFns #######

/** A raw middleFn cannot declare a return type, so an error it returns is undeclared: it ends the
 *  request and reaches the client untyped, exactly like a thrown one. */
export type MayReturnError = void | RpcError<string> | Promise<RpcError<string> | void>;

export type MiddleFnsCollection = {
  [key: string]: MiddleFnDef | HeadersMiddleFnDef | RawMiddleFnDef;
};

// ####### Private MiddleFns #######

export interface PrivateMiddleFnDef extends MiddleFnDef {
  handler: (ctx?: any) => void | never | undefined;
}

export type PrivateDef = PrivateMiddleFnDef | RawMiddleFnDef;

// ####### Remote Methods Metadata #######

/** Data structure containing all public routes & middleFns.
 * is a Ts Mapped type the remove private middleFns and rawMiddleFns.
 * Each public method carries its EFFECTIVE options (route literal, then router literal, then the
 * default), the values `initRoutes` returns at runtime and a client build reads off this type.
 */
// prettier-ignore
export type PublicApi<Type extends Routes> = Prettify<{
    [Property in keyof Type as Type[Property] extends PrivateDef ? never : Property]
    : Type[Property] extends MiddleFnDef<infer H, infer RO, infer O>
    ? PublicMiddleFn<PublicHandler<H>, ResolvedMiddleFnOptions<RO, O>>
    : Type[Property] extends HeadersMiddleFnDef<infer H, infer RO, infer O>
    ? PublicHeadersFn<PublicHandler<H>, ResolvedMiddleFnOptions<RO, O>>
    : Type[Property] extends RouteDef<infer H, infer RO, infer O> // Routes
    ? PublicRoute<PublicHandler<H>, ResolvedRouteOptions<RO, O>>
        : Type[Property] extends Routes // Routes & PureRoutes (recursion)
        ? PublicApi<Type[Property]>
        : never;
}>;

// type-remote-api-start
/** Same as Public Api but no type mapping, should be easier to use than PublicApi when non strong types are required. */
export type RemoteApi = {
  [key: string]: PublicRoute | PublicMiddleFn | PublicHeadersFn | RemoteApi;
};
// type-remote-api-end

/** Public Routes, handler type is the same as RemoteRoute but does not include the context  */
export interface PublicRoute<H extends Handler = any, Opts = RemoteMethodOpts> extends MethodMetadata {
  type: typeof HandlerType.route;
  middleFnIds: string[];
  headerNames: undefined;
  handler: H;
  /** the effective options, as the router resolved them */
  options: Opts;
}

/** Public MiddleFns, handler type is the same as RemoteMiddleFns but does not include the context  */
export interface PublicMiddleFn<H extends Handler = any, Opts = RemoteMethodOpts> extends MethodMetadata {
  type: typeof HandlerType.middleFn;
  handler: H;
  /** the effective options, as the router resolved them */
  options: Opts;
}

/** Public HeadersFns, handler type is the same as HeadersFns but does not include the context */
export interface PublicHeadersFn<H extends Handler = any, Opts = RemoteMethodOpts> extends MethodMetadata {
  type: typeof HandlerType.headersMiddleFn;
  headerNames: string[];
  handler: H;
  /** the effective options, as the router resolved them */
  options: Opts;
}

/** Removes the context from handlers */
// prettier-ignore
export type PublicHandler<H extends Handler> =
    H extends (ctx: CallContext, ...rest: infer Req) => infer Resp
    ? (...rest: Req) => Promise<Awaited<Resp>>
    : never;
