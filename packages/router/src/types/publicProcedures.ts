/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import {SerializableJITFunctions} from '@mionkit/runtype';
import {CallContext} from './context';
import {Routes} from './general';
import {ProcedureType} from './procedures';
import {Handler} from './handlers';
import {HeaderHookDef, HookDef, RawHookDef, RouteDef} from './definitions';

// ####### Raw Hooks #######

export type ErrorReturn = void | RpcError | Promise<RpcError | void>;

export type HooksCollection = {
    [key: string]: HookDef | HeaderHookDef | RawHookDef;
};

// ####### Private Hooks #######

export interface PrivateHookDef extends HookDef {
    handler: (ctx?: any) => void | never | undefined;
}

export interface PrivateHeaderDef extends HeaderHookDef {
    handler: (ctx?: any) => void | never | undefined;
}

export interface PrivateRawDef extends RawHookDef {
    handler: (ctx?: any, req?: any, resp?: any, opts?: any) => any;
}

export type PrivateDef = PrivateHookDef | PrivateHeaderDef | PrivateRawDef;

// ####### Remote Methods Metadata #######
/** Data structure containing all public data an types of routes & hooks. */
// prettier-ignore
export type PublicApi<Type extends Routes> = {
    [Property in keyof Type as Type[Property] extends PrivateDef ? never : Property]
    : Type[Property] extends HookDef
    ? PublicHookProcedure<Type[Property]['handler']>
    : Type[Property] extends HeaderHookDef
    ? PublicHeaderProcedure<Type[Property]['handler']>
    : Type[Property] extends RouteDef // Routes
    ? PublicRouteProcedure<Type[Property]['handler']>
        : Type[Property] extends Routes // Routes & PureRoutes (recursion)
        ? PublicApi<Type[Property]>
        : never;

    // [Property in keyof Type as Type[Property] extends PrivateDef ? never : Property]
    //     : Type[Property] extends Procedure 
    //     ? Procedure<Type[Property]['handler']>
    //         : Type[Property] extends Routes // Routes (recursion)
    //         ? PublicApi<Type[Property]>
    //         : never;
};

// quite similar to Executable but omits some server only properties
export interface PublicProcedure<H extends Handler = any> {
    type: ProcedureType;
    /** Type reference to the route handler, it's runtime value is actually null, just used statically by typescript. */
    handler: PublicHandler<H>;
    /** data and code required to build the functions to serialize and validate handler parameters  */
    serializedFnParams: SerializableJITFunctions;
    /** data and code required to build the functions to serialize and validate handler return  */
    serializedFnReturn: SerializableJITFunctions;
    id: string;
    useValidation: boolean;
    useSerialization: boolean;
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
export interface PublicHookProcedure<H extends Handler = any> extends PublicProcedure<H> {
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
    [Property in keyof RMS]: RMS[Property] extends PublicRouteProcedure | PublicHookProcedure | PublicHeaderProcedure
        ? RMS[Property]['handler']
        : never;
};

export type PublicResponses = {
    [key: string]: unknown | RpcError;
};
