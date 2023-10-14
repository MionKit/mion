/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import {SerializedTypes} from '@mionkit/reflection';
import {CallContext} from './context';
import {RouterOptions, Routes} from './general';
import {HeaderHookDef, HookDef, RawHookDef, RouteDef} from './definitions';
import {Handler} from './handlers';

// ####### Raw Hooks #######

export type ErrorReturn = void | RpcError | Promise<RpcError | void>;

export type HooksCollection<
    Context extends CallContext = CallContext,
    RawReq = unknown,
    RawResp = unknown,
    Opts extends RouterOptions<RawReq> = RouterOptions<RawReq>,
> = {
    [key: string]: RawHookDef<Context, RawReq, RawResp, Opts> | HookDef<Context> | HeaderHookDef<Context>;
};

// ####### Private Hooks #######

export interface PrivateHookDef extends HookDef {
    hook: (ctx?: any) => void | never | undefined;
}

export interface PrivateHeaderHookDef extends HeaderHookDef {
    hook: (ctx?: any) => void | never | undefined;
}

export interface PrivateRawHookDef extends RawHookDef {
    hook: (ctx?: any, req?: any, resp?: any, opts?: any) => any;
}

export type PrivateHook = PrivateHookDef | PrivateHeaderHookDef | PrivateRawHookDef;

// ####### Remote Methods Metadata #######
/** Data structure containing all public data an types of routes & hooks. */
export type RemoteApi<Type extends Routes> = {
    [Property in keyof Type as Type[Property] extends PrivateHook ? never : Property]: Type[Property] extends HookDef
        ? RemoteHookMetadata<Type[Property]['hook']>
        : Type[Property] extends HeaderHookDef
        ? RemoteHeaderHookMetadata<Type[Property]['hook']>
        : // Routes
        Type[Property] extends RouteDef
        ? RemoteRouteMetadata<Type[Property]['route']>
        : Type[Property] extends Handler
        ? RemoteRouteMetadata<Type[Property]>
        : // Routes & PureRoutes (recursion)
        Type[Property] extends Routes
        ? RemoteApi<Type[Property]>
        : never;
};

// prettier-ignore
export type RemoteHandler<H extends Handler> = 
    H extends (ctx: CallContext, ...rest: infer Req) => infer Resp
    ? (...rest: Req) => Promise<Exclude<Awaited<Resp>, RpcError | Error> | RpcError>
    : never;

export interface RemoteMethodMetadata<H extends Handler = any> {
    /** Type reference to the route handler, it's runtime value is actually null, just used statically by typescript. */
    _handler: RemoteHandler<H>;
    /** Json serializable structure so the Type information can be transmitted over the wire */
    serializedTypes: SerializedTypes;
    isRoute: boolean;
    id: string;
    inHeader: boolean;
    enableValidation: boolean;
    enableSerialization: boolean;
    params: string[];
    hookIds?: string[];
    pathPointers?: string[][];
    headerName?: string;
}

/** Public map from Routes, _handler type is the same as router's handler but does not include the context  */
export interface RemoteRouteMetadata<H extends Handler = any> extends RemoteMethodMetadata<H> {
    isRoute: true;
    inHeader: false;
    hookIds: string[];
    headerName: undefined;
}

/** Public map from Hooks, _handler type is the same as hooks's handler but does not include the context  */
export interface RemoteHookMetadata<H extends Handler = any> extends RemoteMethodMetadata<H> {
    isRoute: false;
    inHeader: false;
    pathPointers: undefined;
}

export interface RemoteHeaderHookMetadata<H extends Handler = any> extends RemoteMethodMetadata<H> {
    isRoute: false;
    inHeader: true;
    headerName: string;
}

export type RemoteHandlers<RMS extends RemoteApi<any>> = {
    [Property in keyof RMS]: RMS[Property] extends RemoteRouteMetadata | RemoteHookMetadata | RemoteHeaderHookMetadata
        ? RMS[Property]['_handler']
        : never;
};

export type RemoteMethodResponses = {
    [key: string]: unknown | RpcError;
};
