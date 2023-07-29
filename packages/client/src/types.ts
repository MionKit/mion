/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SerializedTypes} from '@deepkit/type';
import {PublicError, RouteError} from '@mionkit/core';
import {PublicHook, PublicMethods, PublicRoute, Routes} from '@mionkit/router';
import {FunctionReflection} from '@mionkit/runtype';

export type ClientOptions = {
    apiURL: string;
    storage: 'localStorage' | 'sessionStorage' | 'none';
    localStorageKey: string;
};

// ####### Public Route Types #######
/**
 * Most of these types are duplicated from router so we don't have circular dependencies
 * we could go down the path of moving types to @mionkit/core but we would end up
 * with almost all types from router mover there.
 * So instead that we just need to make sure  PublicRoute and PublicHook have the same interface as in the router.
 */

export type RemoteHandler = (...rest: any[]) => Promise<[any | null, PublicError | undefined]>;

// TODO: User Router types and use only path instead path and fieldName
/** Public map from Routes, _handler type is the same as router's handler but does not include the context  */
export interface RemoteRoute {
    /** Type reference to the route handler, its value is actually null or void function ans should never be called. */
    _handler: RemoteHandler;
    /** Json serializable structure so the Type information can be transmitted over the wire */
    handlerSerializedType: SerializedTypes;
    isRoute: true;
    path: string;
    inHeader: false;
    enableValidation: boolean;
    enableSerialization: boolean;
    params: string[]; // names of the parameters as they appear in the remote handler
}

/** Public map from Hooks, _handler type is the same as hooks's handler but does not include the context  */
export interface RemoteHook {
    _handler: RemoteHandler;
    /** Json serializable structure so the Type information can be transmitted over the wire */
    handlerSerializedType: SerializedTypes;
    isRoute: false;
    inHeader: boolean;
    fieldName: string;
    enableValidation: boolean;
    enableSerialization: boolean;
    params: string[]; // names of the parameters as they appear in the remote handler
}

export type RemoteMethod = {
    path: string;
    reflection: FunctionReflection;
} & (RemoteRoute | Omit<RemoteHook, 'fieldName'>);

export type RemoteMethods<M extends RemoteMethod> = {
    [key: string]: M;
};

export type RequestBody = {
    [key: string]: any[];
};

export type RemoteHandlerResponse<Resp> = [Resp | null, PublicError | RouteError | undefined];
export type RemoteResponses = {
    [key: string]: RemoteHandlerResponse<any>;
};

export interface RemoteHandlers {
    [key: string]: HasHandler | null;
}

export type HasHandler = {_handler: RemoteHandler};

export interface ClientMethod<Parent, H extends HasHandler> {
    preset: (...params: Parameters<H['_handler']>) => Parent;
    params: (...params: Parameters<H['_handler']>) => Parent;
    fetch: () => ReturnType<H['_handler']>;
}

export type ClientMethods<Type extends RemoteHandlers> = {
    [Property in keyof Type]: Type[Property] extends HasHandler ? ClientMethod<ClientMethods<Type>, Type[Property]> : never;
};
