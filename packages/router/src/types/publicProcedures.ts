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
import {ProcedureType} from './procedures';
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
export type PublicApi<Type extends Routes> = {
    [Property in keyof Type as Type[Property] extends PrivateHook ? never : Property]: Type[Property] extends HookDef
        ? PublicHookExecutable<Type[Property]['hook']>
        : Type[Property] extends HeaderHookDef
          ? PublicHeaderProcedure<Type[Property]['hook']>
          : // Routes
            Type[Property] extends RouteDef
            ? PublicRouteProcedure<Type[Property]['route']>
            : Type[Property] extends Handler
              ? PublicRouteProcedure<Type[Property]>
              : // Routes & PureRoutes (recursion)
                Type[Property] extends Routes
                ? PublicApi<Type[Property]>
                : never;
};

// quite similar to Executable but omits some server only properties
export interface PublicProcedure<H extends Handler = any> {
    type: ProcedureType;
    /** Type reference to the route handler, it's runtime value is actually null, just used statically by typescript. */
    handler: PublicHandler<H>;
    /** Json serializable structure so the Type information can be transmitted over the wire */
    serializedTypes: SerializedTypes;
    id: string;
    enableValidation: boolean;
    enableSerialization: boolean;
    params: string[];
    hookIds?: string[];
    pathPointers?: string[][];
    headerName?: string;
}

/** Public map from Routes, handler type is the same as router's handler but does not include the context  */
export interface PublicRouteProcedure<H extends Handler = any> extends PublicProcedure<H> {
    type: ProcedureType.route;
    hookIds: string[];
    headerName: undefined;
}

/** Public map from Hooks, handler type is the same as hooks's handler but does not include the context  */
export interface PublicHookExecutable<H extends Handler = any> extends PublicProcedure<H> {
    type: ProcedureType.hook;
    pathPointers: undefined;
}

export interface PublicHeaderProcedure<H extends Handler = any> extends PublicProcedure<H> {
    type: ProcedureType.headerHook;
    headerName: string;
}

// prettier-ignore
export type PublicHandler<H extends Handler> = 
    H extends (ctx: CallContext, ...rest: infer Req) => infer Resp
    ? (...rest: Req) => Promise<Exclude<Awaited<Resp>, RpcError | Error> | RpcError>
    : never;

export type PublicHandlers<RMS extends PublicApi<any>> = {
    [Property in keyof RMS]: RMS[Property] extends PublicRouteProcedure | PublicHookExecutable | PublicHeaderProcedure
        ? RMS[Property]['handler']
        : never;
};

export type PublicResponses = {
    [key: string]: unknown | RpcError;
};
