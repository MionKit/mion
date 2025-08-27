/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import type {RunTypeError} from '@mionkit/core';
import type {JitCompiledFunctions} from '@mionkit/core';
import type {JsonParser, PublicHeaderMethod, PublicHookMethod, PublicMethod, PublicApi, PublicRouteMethod} from '@mionkit/router';
import type {MionRequest} from './request';

export type StorageType = 'localStorage' | 'sessionStorage';

export type ClientOptions = {
    baseURL: string;
    storage: StorageType;
    fetchOptions: RequestInit;

    // ############# ROUTER OPTIONS (should match router options) #############

    /** prefix for all routes, i.e: api/v1.
     * path separator is added between the prefix and the route */
    prefix: string;
    /** suffix for all routes, i.e: .json.
     * Not path separators is added between the route and the suffix */
    suffix: string;
    /** enable automatic parameter validation, defaults to true */
    validateParams: boolean;
    /** Enables serialization/deserialization */
    deserializeParams: boolean;
    /** automatically generate and uuid */
    autoGenerateErrorId: boolean;
    /** Custom JSON parser, defaults to Native js JSON */
    bodyParser: JsonParser;
};

export type InitOptions = Partial<ClientOptions> & {baseURL: string};
export type MetadataById = Map<string, PublicMethod>;
export type JitFunctionsById = Map<string, RemoteMethodJIT>;
export type RequestHeaders = {[key: string]: string};
export type RequestBody = {[key: string]: any[]};
export type PublicMethodReflection = {paramsJit: JitCompiledFunctions};
export type HandlerResponse<RM extends PublicMethod> = Awaited<ReturnType<RM['handler']>>;
export type HandlerSuccessResponse<RM extends PublicMethod> = Exclude<HandlerResponse<RM>, RpcError<any> | Error>;
export type HandlerFailResponse<RM extends PublicMethod> = Extract<HandlerResponse<RM>, RpcError<any> | Error>;
export type SuccessResponse<MR extends SubRequest<any>> = Required<MR>['return'];
export type SuccessResponses<List extends SubRequest<any>[]> = {[P in keyof List]: SuccessResponse<List[P]>};
export type FailResponse<MR extends SubRequest<any>> = Required<MR>['error'];
export type FailResponses<List extends SubRequest<any>[]> = {[P in keyof List]: FailResponse<List[P]>};
export type RequestErrors = Map<string, RpcError<any>>;

// ############# Remote Methods Request #############

/** Represents a remote method (sub request).
 * A route request can contains multiple subRequest to the route itself and any required hook*/
export interface SubRequest<RM extends PublicMethod> {
    pointer: string[];
    id: RM['id'];
    isResolved: boolean;
    params: Parameters<RM['handler']>;
    return?: HandlerSuccessResponse<RM>;
    error?: HandlerFailResponse<RM>;
    serializedParams?: any[];
    // note this type can't contain functions, so it can be stored/restored from localStorage
}

/** structure returned from the proxy, containing info of the remote route to execute
 * Note routePointer is using as differentiating key from hookPointer in HookInfo, so types can't overlap.
 */
export interface RouteSubRequest<RR extends PublicRouteMethod> extends SubRequest<RR> {
    /**
     * Validates Route's parameters and returns type errors. Throws RpcError if validation fails.
     */
    typeErrors: () => Promise<RunTypeError[]>;
    /**
     * Sets hooks to be used for the route call in a chainable manner.
     * @param hooks HookSubRequests to be used by the route
     * @returns The same RouteSubRequest for chaining
     */
    hooks: <RHList extends HookSubRequest<any>[]>(...hooks: RHList) => RouteSubRequest<RR>;
    /**
     * Calls a remote route.
     * Validates route and required hooks request parameters locally before calling the remote route.
     * Throws RpcError if anything fails during the call (including validation or serialization) or if the remote route returns an error.
     * Uses hooks set via the hooks() method.
     * @returns
     */
    call: () => Promise<HandlerSuccessResponse<RR>>;
}

/** structure returned from the proxy, containing info of the remote hook to execute
 * Note hookPointer is using as differentiating key from routePointer in RouteInfo, so types can't overlap.
 */
export interface HookSubRequest<RH extends PublicHookMethod | PublicHeaderMethod> extends SubRequest<RH> {
    /**
     * Validates Hook's parameters and returns type errors. Throws RpcError if validation fails.
     */
    typeErrors: () => Promise<RunTypeError[]>;
    /**
     * Prefills Hook's parameters for any future request. Parameters are also persisted in local storage for future requests.
     * Validates and Serializes parameters before storing in local storage.
     * Throws RpcError if validation or serialization fail or if the parameters can't be persisted.
     * @returns Promise<void>
     */
    prefill: () => Promise<void>;

    /**
     * Removes prefilled value.
     * Throws RpcError if something fails removing the prefilled parameters
     * @returns Promise<void>
     */
    removePrefill: () => Promise<void>;
}

export interface SuccessSubRequest<RM extends PublicMethod> extends SubRequest<RM> {
    return: HandlerSuccessResponse<RM>;
    error: undefined;
}

export type HookCall<RH extends PublicHookMethod | PublicHeaderMethod> = (
    ...params: Parameters<RH['handler']>
) => HookSubRequest<RH>;
export type RouteCall<RR extends PublicRouteMethod> = (...params: Parameters<RR['handler']>) => RouteSubRequest<RR>;

export type NonClientRoute = never | PublicHookMethod | PublicHeaderMethod;

export type ClientRoutes<RMS extends PublicApi<any>> = {
    [Property in keyof RMS as RMS[Property] extends NonClientRoute ? never : Property]: RMS[Property] extends PublicRouteMethod
        ? RouteCall<RMS[Property]>
        : RMS[Property] extends PublicApi<any>
          ? ClientRoutes<RMS[Property]>
          : never;
};

export type NonClientHook = never | PublicRouteMethod | {[key: string]: PublicRouteMethod};

export type ClientHooks<RMS extends PublicApi<any>> = {
    [Property in keyof RMS as RMS[Property] extends NonClientHook ? never : Property]: RMS[Property] extends
        | PublicHookMethod
        | PublicHeaderMethod
        ? HookCall<RMS[Property]>
        : RMS[Property] extends PublicApi<any>
          ? ClientHooks<RMS[Property]>
          : never;
};

export type Cleaned<RMS extends PublicApi<any>> = {
    [Property in keyof RMS as RMS[Property] extends never ? never : Property]: RMS[Property];
};

export type SuccessClientResponse<RR extends RouteSubRequest<any>, RHList extends HookSubRequest<any>[]> = [
    SuccessResponse<RR>,
    ...SuccessResponses<RHList>,
];

export type ValidationRequest = Pick<MionRequest<any, any>, 'metadataById' | 'jitFunctionsById' | 'options' | 'subRequests'>;

export type RemoteMethodJIT = {
    return: JitCompiledFunctions;
    params: JitCompiledFunctions;
};

// ############# STRONG PROMISE  (reject error is strongly typed) #############
// TODO: typescript complains async function only can return a Promise Type
// export interface StrongPromise<ReturnType, ErrorType> extends Promise<ReturnType> {
//     catch<NewErrorType = never>(
//         onRejected?: ((error: ErrorType) => PromiseLike<NewErrorType>) | null
//     ): StrongPromise<ReturnType | NewErrorType, NewErrorType | ErrorType>;

//     then<NewReturnType = ReturnType, NewErrorType = ErrorType>(
//         onFulfilled?: ((value: ReturnType) => NewReturnType | PromiseLike<NewReturnType>) | null | undefined,
//         onRejected?: ((error: ErrorType) => NewErrorType | PromiseLike<NewErrorType>) | null | undefined
//     ): StrongPromise<NewReturnType, NewErrorType>;
// }

// export type RpcPromise<
//     RR extends RouteRequest<any>,
//     RHList extends HookRequest<any>[],
//     Success = [SuccessResponse<RR>, ...SuccessResponses<RHList>],
//     Fail = [FailResponse<RR>, ...FailResponses<RHList>],
// > = StrongPromise<Success, Fail>;

// // maps an array of RemoteRequest to an object where keys are ids (but no strong key types happens if the array is not a constant
// export type RecordOf<TupleType extends readonly {id: string}[]> = {
//     [Item in TupleType[number] as Item['id']]: Item;
// };
