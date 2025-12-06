/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Prettify, RpcError, SerializablePublicMethod, HandlerType} from '@mionkit/core';
import type {CallContext} from './context';
import type {Routes} from './general';
import type {Handler} from './handlers';
import type {HeaderHookDef, HookDef, RawHookDef, RouteDef} from './definitions';

// ####### Raw Hooks #######

export type ErrorReturn = void | RpcError<string> | Promise<RpcError<string> | void>;

export type HooksCollection = {
    [key: string]: HookDef | HeaderHookDef | RawHookDef;
};

// ####### Private Hooks #######

export interface PrivateHookDef extends HookDef {
    handler: (ctx?: any) => void | never | undefined;
}

export type PrivateDef = PrivateHookDef | RawHookDef;

// ####### Remote Methods Metadata #######

/** Data structure containing all public data an types of routes & hooks. */
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

export type RemoteApi = {
    [key: string]: PublicRoute | PublicHook | PublicHeadersHook | RemoteApi;
};

/** Public map from Routes, handler type is the same as router's handler but does not include the context  */
export interface PublicRoute<H extends Handler = any> extends SerializablePublicMethod {
    type: HandlerType.route;
    hookIds: string[];
    headerNames: undefined;
    handler: H;
}

/** Public map from Hooks, handler type is the same as hooks's handler but does not include the context  */
export interface PublicHook<H extends Handler = any> extends SerializablePublicMethod {
    type: HandlerType.hook;
    pathPointers: undefined;
    handler: H;
}

export interface PublicHeadersHook<H extends Handler = any> extends SerializablePublicMethod {
    type: HandlerType.headerHook;
    headerNames: string[];
    handler: H;
}

// prettier-ignore
export type PublicHandler<H extends Handler> =
    H extends (ctx: CallContext, ...rest: infer Req) => infer Resp
    ? (...rest: Req) => Promise<Awaited<Resp>>
    : never;

export type PublicResponses = {
    [key: string]: unknown | RpcError<string>;
};
