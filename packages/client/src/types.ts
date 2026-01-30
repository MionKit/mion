/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import type {Prettify, RunTypeError, SerializerMode, ValidationError} from '@mionkit/core';
import type {PublicHeadersFn, PublicLinkedFn, RemoteApi, PublicRoute} from '@mionkit/router';
import type {TypedEvent} from './typedEvent';

// ############# Result Type #############

// type-result-start
/**
 * Result type for call() and callWithLinkedFns() methods - 4-tuple pattern.
 * Provides type-safe async/await pattern without losing error typing.
 * Tuple allows natural naming: `const [user, error, linkedFnResults, linkedFnErrors] = await routes.users.getById('123').call();`
 *
 * The 4-tuple pattern provides:
 * - Direct access to route result/error
 * - Access to linkedFn results/errors for both prefilled and explicit linkedFns
 * - Backward compatible - `const [user, error] = ...` still works (partial destructuring)
 *
 * @typeParam RouteSuccess - The success type of the route
 * @typeParam RouteError - The error type of the route
 * @typeParam LinkedFnsResults - Record of linkedFn names to their success types
 * @typeParam LinkedFnsErrors - Record of linkedFn names to their error types
 */
export type Result<
    RouteSuccess,
    RouteError,
    LinkedFnsResults extends Record<string, unknown> = Record<string, unknown>,
    LinkedFnsErrors extends Record<string, RpcError<string, unknown>> = Record<string, RpcError<string, unknown>>,
> = [RouteSuccess | undefined, RouteError | undefined, LinkedFnsResults | undefined, LinkedFnsErrors | undefined];
// type-result-end

// ############# callWithLinkedFns Result Types #############

/**
 * Extract success type from a LinkedFnSubRequest.
 */
export type LinkedFnSuccess<H> = H extends HSubRequest<infer PH> ? HandlerSuccessResponse<PH> : never;

/**
 * Extract error type from a LinkedFnSubRequest.
 */
export type LinkedFnError<H> = H extends HSubRequest<infer PH> ? Simplify<HandlerErrors<PH>> : never;

/**
 * Result type for callWithLinkedFns method - 4-tuple pattern.
 * Returns [routeResult, routeError, linkedFnsResults, linkedFnsErrors] where:
 * - routeResult: success value if route succeeded (undefined if failed)
 * - routeError: error if route failed (undefined if succeeded)
 * - linkedFnsResults: record of linkedFn names to their success values
 * - linkedFnsErrors: record of linkedFn names to their error values
 *
 * This provides the same structure as Result for consistency and direct access.
 *
 * @typeParam RouteSuccess - The success type of the route
 * @typeParam RouteError - The error type of the route
 * @typeParam LinkedFns - Record of linkedFn names to LinkedFnSubRequest types
 */
// type-call-with-linkedFns-result-start
export type CallWithLinkedFnsResult<RouteSuccess, RouteError, LinkedFns extends Record<string, HSubRequest<any>>> = [
    RouteSuccess | undefined,
    RouteError | ValidationError | undefined,
    {[K in keyof LinkedFns]?: LinkedFnSuccess<LinkedFns[K]>} | undefined,
    {[K in keyof LinkedFns]?: LinkedFnError<LinkedFns[K]>} | undefined,
];
// type-call-with-linkedFns-result-end

export type ClientOptions = {
    baseURL: string;
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
    /** Default serializer mode - strin */
    serializer: SerializerMode;
};

type PublicHandler = (...args: any[]) => Promise<any>;
type PublicMethod = PublicRoute | PublicLinkedFn | PublicHeadersFn;
type ExtractHandler<PM extends PublicMethod> = PM extends {handler: infer H} ? H : never;

export type InitOptions = Partial<ClientOptions> & {baseURL: string};
export type RequestHeaders = {[key: string]: string};
export type RequestBody = {[key: string]: any[]};

// ############# Routes Parameter Utility Types #############

/** Extracts all parameters from a PublicRoute, PublicLinkedFn, or PublicHeadersFn. */
export type RouteParamsType<PM extends PublicMethod> = Parameters<ExtractHandler<PM>>;
/** Extracts a single parameter at a given index from a PublicRoute, PublicLinkedFn, or PublicHeadersFn. */
export type RouteParamType<PM extends PublicMethod, Index extends number> = Parameters<ExtractHandler<PM>>[Index];
/** Extracts the headers parameter (first param) from a PublicHeadersFn handler. */
export type HeadersParamsType<PM extends PublicHeadersFn> = Parameters<ExtractHandler<PM>>[0];

// others
export type HandlerResponse<PH extends PublicHandler> = Awaited<ReturnType<PH>>;
export type HandlerSuccessResponse<PH extends PublicHandler> = Exclude<HandlerResponse<PH>, RpcError<string>>;
export type HandlerFailResponse<PH extends PublicHandler> = Extract<HandlerResponse<PH>, RpcError<string>>;
export type SuccessResponse<MR extends SubRequest<any>> = Required<MR>['resolvedValue'];
export type SuccessResponses<List extends SubRequest<any>[]> = {[P in keyof List]: SuccessResponse<List[P]>};
export type FailResponse<MR extends SubRequest<any>> = Required<MR>['error'];
export type FailResponses<List extends SubRequest<any>[]> = {[P in keyof List]: FailResponse<List[P]>};
export type RequestErrors = Map<string, RpcError<string>>;

// ############# Error Handler Types #############

/**
 * Handler function for a specific error type.
 * @typeParam T - The error type string literal
 */
/**
 * Handler function for a specific error type.
 * @typeParam E - The full RpcError type
 */
export type ErrorHandler<E extends RpcError<string, any>> = (error: E) => void;

/**
 * Handler function for unknown/unhandled errors.
 */
export type UnknownErrorHandler = (error: RpcError<string, any>) => void;

/**
 * Handler function for successful results.
 * @typeParam S - The success type
 */
export type SuccessHandler<S> = (result: S) => void;

/**
 * Utility type to force TypeScript to evaluate/resolve the type.
 * This improves hover display by showing the resolved union instead of the generic type alias.
 */
type Simplify<T> = T extends any ? T : never;

/**
 * Extracts all RpcError types from a handler's return type as a union.
 * Returns the full RpcError types (with ErrData), not just the type strings.
 * Also includes ValidationError since validation errors can be thrown for any route/linkedFn.
 * @typeParam PH - The public handler type
 */
export type HandlerErrors<PH extends (...args: any[]) => Promise<any>> = Simplify<
    Extract<HandlerResponse<PH>, RpcError<string, any>> | ValidationError
>;

// ############# Remote Methods Request #############

// type-sub-request-start
/** Represents a remote method (sub request).
 * A route request can contains multiple subRequest to the route itself and any required linkedFn*/
export interface SubRequest<PH extends PublicHandler> {
    pointer: string[];
    id: string;
    isResolved: boolean;
    params: Parameters<PH>;
    /** The resolved value after the request completes successfully */
    resolvedValue?: HandlerSuccessResponse<PH>;
    error?: HandlerFailResponse<PH>;
    serializedParams?: any[];
}
// type-sub-request-end

// type-route-sub-request-start
/** structure returned from the proxy, containing info of the remote route to execute
 * Note routePointer is using as differentiating key from linkedFnPointer in LinkedFnInfo, so types can't overlap.
 */
export interface RSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
    /**
     * Validates Route's parameters and returns type errors. Throws RpcError if validation fails.
     */
    typeErrors: () => Promise<RunTypeError[]>;

    /**
     * Calls a remote route and returns a Result 4-tuple with full typing preserved.
     * Never throws - errors are always in the result tuple.
     *
     * @returns Promise that resolves to [routeResult, routeError, linkedFnsResults, linkedFnsErrors] tuple
     */
    call: () => Promise<
        Result<
            HandlerSuccessResponse<PH>,
            Simplify<HandlerErrors<PH>>,
            Record<string, unknown>, // linkedFns results
            Record<string, RpcError<string, unknown> | ValidationError> // linkedFns errors
        >
    >;

    /**
     * Calls a remote route with linkedFns and returns a fully-typed 4-tuple result.
     * Always returns (never throws) - can have partial success where some linkedFns/route succeed and others fail.
     *
     * @param linkedFns Record of linkedFn names to LinkedFnSubRequest instances
     * @returns Promise that resolves to [routeResult, routeError, linkedFnsResults, linkedFnsErrors] tuple
     */
    callWithLinkedFns: <H extends Record<string, HSubRequest<any>>>(
        linkedFns: H
    ) => Promise<CallWithLinkedFnsResult<HandlerSuccessResponse<PH>, Simplify<HandlerErrors<PH>>, H>>;
}
// type-route-sub-request-end

// type-linkedFn-sub-request-start
/** structure returned from the proxy, containing info of the remote linkedFn to execute
 * Note linkedFnPointer is using as differentiating key from routePointer in RouteInfo, so types can't overlap.
 */
export interface HSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
    /**
     * Validates LinkedFn's parameters and returns type errors. Throws RpcError if validation fails.
     */
    typeErrors: () => Promise<RunTypeError[]>;
    /**
     * Prefills LinkedFn's parameters for any future request and returns TypedEvent for persistent event handling.
     * Parameters are validated and serialized for future requests.
     * The TypedEvent allows registering:
     * - onSuccess handlers called for ALL future successful requests from this linkedFn
     * - onError handlers called for ALL future requests that fail with specific error types
     * @returns TypedEvent for chaining onSuccess/onError handlers
     */
    prefill: () => TypedEvent<HandlerSuccessResponse<PH>, Simplify<HandlerErrors<PH>>>;

    /**
     * Removes prefilled value.
     * Throws RpcError if something fails removing the prefilled parameters
     * @returns Promise<void>
     */
    removePrefill: () => Promise<void>;
}
// type-linkedFn-sub-request-end

export type NonClientRoute = never | PublicLinkedFn | PublicHeadersFn;

export type ClientRoutes<RA extends RemoteApi> = Prettify<{
    [Property in keyof RA as RA[Property] extends NonClientRoute ? never : Property]: RA[Property] extends PublicRoute
        ? (...params: Parameters<RA[Property]['handler']>) => RSubRequest<RA[Property]['handler']>
        : RA[Property] extends RemoteApi
          ? ClientRoutes<RA[Property]>
          : never;
}>;

export type NonClientLinkedFn = never | PublicRoute | {[key: string]: PublicRoute};

export type ClientLinkedFns<RA extends RemoteApi> = Prettify<{
    [Property in keyof RA as RA[Property] extends NonClientLinkedFn ? never : Property]: RA[Property] extends
        | PublicLinkedFn
        | PublicHeadersFn
        ? (...params: Parameters<RA[Property]['handler']>) => HSubRequest<RA[Property]['handler']>
        : RA[Property] extends RemoteApi
          ? ClientLinkedFns<RA[Property]>
          : never;
}>;

export type Cleaned<RMS extends RemoteApi> = {
    [Property in keyof RMS as RMS[Property] extends never ? never : Property]: RMS[Property];
};

export type SuccessClientResponse<RS extends RSubRequest<any>, RHList extends HSubRequest<any>[]> = [
    SuccessResponse<RS>,
    ...SuccessResponses<RHList>,
];

export type PrefilledLinkedFnsCache = Map<string, SubRequest<any>>;
