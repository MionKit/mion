/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import type {Prettify, RunTypeError} from '@mionkit/core';
import type {PublicHeadersHook, PublicHook, PublicMethod, RemoteApi, PublicRoute} from '@mionkit/router';

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
    /** automatically generate and uuid */
    autoGenerateErrorId: boolean;
};

type PublicHandler = (...args: any[]) => Promise<any>;

export type InitOptions = Partial<ClientOptions> & {baseURL: string};
export type RequestHeaders = {[key: string]: string};
export type RequestBody = {[key: string]: any[]};
export type HandlerResponse<PH extends PublicHandler> = Awaited<ReturnType<PH>>;
export type HandlerSuccessResponse<PH extends PublicHandler> = Exclude<HandlerResponse<PH>, RpcError<string>>;
export type HandlerFailResponse<PH extends PublicHandler> = Extract<HandlerResponse<PH>, RpcError<string>>;
export type SuccessResponse<MR extends SubRequest<any>> = Required<MR>['result'];
export type SuccessResponses<List extends SubRequest<any>[]> = {[P in keyof List]: SuccessResponse<List[P]>};
export type FailResponse<MR extends SubRequest<any>> = Required<MR>['error'];
export type FailResponses<List extends SubRequest<any>[]> = {[P in keyof List]: FailResponse<List[P]>};
export type RequestErrors = Map<string, RpcError<string>>;

// ############# Remote Methods Request #############

/** Represents a remote method (sub request).
 * A route request can contains multiple subRequest to the route itself and any required hook*/
export interface SubRequest<PH extends PublicHandler> {
    pointer: string[];
    id: string;
    isResolved: boolean;
    params: Parameters<PH>;
    result?: HandlerSuccessResponse<PH>;
    error?: HandlerFailResponse<PH>;
    serializedParams?: any[];
    // note this type can't contain functions, so it can be stored/restored from localStorage
}

/** structure returned from the proxy, containing info of the remote route to execute
 * Note routePointer is using as differentiating key from hookPointer in HookInfo, so types can't overlap.
 */
export interface RouteSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
    /**
     * Validates Route's parameters and returns type errors. Throws RpcError if validation fails.
     */
    typeErrors: () => Promise<RunTypeError[]>;
    /**
     * Sets hooks to be used for the route call in a chainable manner.
     * @param hooks HookSubRequests to be used by the route
     * @returns The same RouteSubRequest for chaining
     */
    hooks: <RHList extends HookSubRequest<any>[]>(...hooks: RHList) => RouteSubRequest<PH>;
    /**
     * Calls a remote route.
     * Validates route and required hooks request parameters locally before calling the remote route.
     * Throws RpcError if anything fails during the call (including validation or serialization) or if the remote route returns an error.
     * Uses hooks set via the hooks() method.
     * @returns
     */
    call: () => Promise<HandlerSuccessResponse<PH>>;
}

/** structure returned from the proxy, containing info of the remote hook to execute
 * Note hookPointer is using as differentiating key from routePointer in RouteInfo, so types can't overlap.
 */
export interface HookSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
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
    result: HandlerSuccessResponse<RM>;
    error: undefined;
}

export type NonClientRoute = never | PublicHook | PublicHeadersHook;

export type ClientRoutes<RMS extends RemoteApi> = Prettify<{
    [Property in keyof RMS as RMS[Property] extends NonClientRoute ? never : Property]: RMS[Property] extends PublicRoute
        ? (...params: Parameters<RMS[Property]['handler']>) => RouteSubRequest<RMS[Property]['handler']>
        : RMS[Property] extends RemoteApi
          ? ClientRoutes<RMS[Property]>
          : never;
}>;

export type NonClientHook = never | PublicRoute | {[key: string]: PublicRoute};

export type ClientHooks<RMS extends RemoteApi> = Prettify<{
    [Property in keyof RMS as RMS[Property] extends NonClientHook ? never : Property]: RMS[Property] extends
        | PublicHook
        | PublicHeadersHook
        ? (...params: Parameters<RMS[Property]['handler']>) => HookSubRequest<RMS[Property]['handler']>
        : RMS[Property] extends RemoteApi
          ? ClientHooks<RMS[Property]>
          : never;
}>;

export type Cleaned<RMS extends RemoteApi> = {
    [Property in keyof RMS as RMS[Property] extends never ? never : Property]: RMS[Property];
};

export type SuccessClientResponse<RR extends RouteSubRequest<any>, RHList extends HookSubRequest<any>[]> = [
    SuccessResponse<RR>,
    ...SuccessResponses<RHList>,
];

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
