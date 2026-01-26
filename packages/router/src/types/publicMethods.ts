/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Prettify, RpcError, MethodMetadata} from '@mionkit/core';
import type {CallContext} from './context';
import type {Routes} from './general';
import type {Handler} from './handlers';
import type {HeaderLinkedFnDef, LinkedFnDef, RawLinkedFnDef, RouteDef} from './definitions';
import {HandlerType} from '@mionkit/core'; // do not import type only

// ####### Raw LinkedFns #######

export type MayReturnError = void | RpcError<string> | Promise<RpcError<string> | void>;

export type LinkedFnsCollection = {
    [key: string]: LinkedFnDef | HeaderLinkedFnDef | RawLinkedFnDef;
};

// ####### Private LinkedFns #######

export interface PrivateLinkedFnDef extends LinkedFnDef {
    handler: (ctx?: any) => void | never | undefined;
}

export type PrivateDef = PrivateLinkedFnDef | RawLinkedFnDef;

// ####### Remote Methods Metadata #######

/** Data structure containing all public routes & linkedFns.
 * is a Ts Mapped type the remove private linkedFns and rawLinkedFns
 */
// prettier-ignore
export type PublicApi<Type extends Routes> = Prettify<{
    [Property in keyof Type as Type[Property] extends PrivateDef ? never : Property]
    : Type[Property] extends LinkedFnDef
    ? PublicLinkedFn<PublicHandler<Type[Property]['handler']>>
    : Type[Property] extends HeaderLinkedFnDef
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
    [key: string]: PublicRoute | PublicLinkedFn | PublicHeadersFn | RemoteApi;
};
// type-remote-api-end

/** Public Routes, handler type is the same as RemoteRoute but does not include the context  */
export interface PublicRoute<H extends Handler = any> extends MethodMetadata {
    type: typeof HandlerType.route;
    linkedFnIds: string[];
    headerNames: undefined;
    handler: H;
}

/** Public LinkedFns, handler type is the same as RemoteLinkedFns but does not include the context  */
export interface PublicLinkedFn<H extends Handler = any> extends MethodMetadata {
    type: typeof HandlerType.linkedFn;
    handler: H;
}

/** Public HeadersFns, handler type is the same as HeadersFns but does not include the context */
export interface PublicHeadersFn<H extends Handler = any> extends MethodMetadata {
    type: typeof HandlerType.headerLinkedFn;
    headerNames: string[];
    handler: H;
}

/** Removes the context from handlers */
// prettier-ignore
export type PublicHandler<H extends Handler> =
    H extends (ctx: CallContext, ...rest: infer Req) => infer Resp
    ? (...rest: Req) => Promise<Awaited<Resp>>
    : never;
