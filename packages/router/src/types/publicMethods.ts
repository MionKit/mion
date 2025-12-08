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
import type {HeaderHookDef, HookDef, RawHookDef, RouteDef} from './definitions';
import {HandlerType} from '@mionkit/core'; // do not import type only

// ####### Raw Hooks #######

export type MayReturnError = void | RpcError<string> | Promise<RpcError<string> | void>;

export type HooksCollection = {
    [key: string]: HookDef | HeaderHookDef | RawHookDef;
};

// ####### Private Hooks #######

export interface PrivateHookDef extends HookDef {
    handler: (ctx?: any) => void | never | undefined;
}

export type PrivateDef = PrivateHookDef | RawHookDef;

// ####### Remote Methods Metadata #######

/** Data structure containing all public routes & hooks.
 * is a Ts Mapped type the remove private hooks and rawHooks
 */
// prettier-ignore
export type PublicApi<Type extends Routes> = Prettify<{
    [Property in keyof Type as Type[Property] extends PrivateDef ? never : Property]
    : Type[Property] extends HookDef
    ? PublicHook<PublicHandler<Type[Property]['handler']>>
    : Type[Property] extends HeaderHookDef
    ? PublicHeadersHook<PublicHandler<Type[Property]['handler']>>
    : Type[Property] extends RouteDef // Routes
    ? PublicRoute<PublicHandler<Type[Property]['handler']>>
        : Type[Property] extends Routes // Routes & PureRoutes (recursion)
        ? PublicApi<Type[Property]>
        : never;
}>;

/** Same as Public Api but no type mapping, should be easier to use than PublicApi when non strong types are required. */
export type RemoteApi = {
    [key: string]: PublicRoute | PublicHook | PublicHeadersHook | RemoteApi;
};

/** Public Routes, handler type is the same as RemoteRoute but does not include the context  */
export interface PublicRoute<H extends Handler = any> extends MethodMetadata {
    type: typeof HandlerType.route;
    hookIds: string[];
    headerNames: undefined;
    handler: H;
}

/** Public Hooks, handler type is the same as RemoteHooks but does not include the context  */
export interface PublicHook<H extends Handler = any> extends MethodMetadata {
    type: typeof HandlerType.hook;
    handler: H;
}

/** Public HeadersHooks, handler type is the same as HeadersHooks but does not include the context */
export interface PublicHeadersHook<H extends Handler = any> extends MethodMetadata {
    type: typeof HandlerType.headerHook;
    headerNames: string[];
    handler: H;
}

/** Removes the context from handlers */
// prettier-ignore
export type PublicHandler<H extends Handler> =
    H extends (ctx: CallContext, ...rest: infer Req) => infer Resp
    ? (...rest: Req) => Promise<Awaited<Resp>>
    : never;
