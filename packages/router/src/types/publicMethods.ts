/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Prettify, RpcError, MethodMetadata} from '@mionkit/core';
import type {CallContext} from './context.ts';
import type {Routes} from './general.ts';
import type {Handler} from './handlers.ts';
import type {HeadersMiddleFnDef, MiddleFnDef, RawMiddleFnDef, RouteDef} from './definitions.ts';
import {HandlerType} from '@mionkit/core'; // do not import type only

// ####### Raw MiddleFns #######

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
 * is a Ts Mapped type the remove private middleFns and rawMiddleFns
 */
// prettier-ignore
export type PublicApi<Type extends Routes> = Prettify<{
    [Property in keyof Type as Type[Property] extends PrivateDef ? never : Property]
    : Type[Property] extends MiddleFnDef
    ? PublicMiddleFn<PublicHandler<Type[Property]['handler']>>
    : Type[Property] extends HeadersMiddleFnDef
    ? PublicHeadersFn<PublicHandler<Type[Property]['handler']>>
    : Type[Property] extends RouteDef // Routes
    ? PublicRoute<PublicHandler<Type[Property]['handler']>>
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
export interface PublicRoute<H extends Handler = any> extends MethodMetadata {
    type: typeof HandlerType.route;
    middleFnIds: string[];
    headerNames: undefined;
    handler: H;
}

/** Public MiddleFns, handler type is the same as RemoteMiddleFns but does not include the context  */
export interface PublicMiddleFn<H extends Handler = any> extends MethodMetadata {
    type: typeof HandlerType.middleFn;
    handler: H;
}

/** Public HeadersFns, handler type is the same as HeadersFns but does not include the context */
export interface PublicHeadersFn<H extends Handler = any> extends MethodMetadata {
    type: typeof HandlerType.headersMiddleFn;
    headerNames: string[];
    handler: H;
}

/** Removes the context from handlers */
// prettier-ignore
export type PublicHandler<H extends Handler> =
    H extends (ctx: CallContext, ...rest: infer Req) => infer Resp
    ? (...rest: Req) => Promise<Awaited<Resp>>
    : never;
