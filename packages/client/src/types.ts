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

/** Result type for call() and callWithLinkedFns() methods - 4-tuple pattern */
export type Result<
    RouteSuccess,
    RouteError,
    LinkedFnsResults extends Record<string, unknown> = Record<string, unknown>,
    LinkedFnsErrors extends Record<string, RpcError<string, unknown>> = Record<string, RpcError<string, unknown>>,
> = [RouteSuccess | undefined, RouteError | undefined, LinkedFnsResults | undefined, LinkedFnsErrors | undefined];

/** Extract success type from a LinkedFnSubRequest */
export type LinkedFnSuccess<H> = H extends HSubRequest<infer PH> ? HandlerSuccessResponse<PH> : never;

/** Extract error type from a LinkedFnSubRequest */
export type LinkedFnError<H> = H extends HSubRequest<infer PH> ? Simplify<HandlerErrors<PH>> : never;

/** Result type for callWithLinkedFns method - 4-tuple pattern */
export type CallWithLinkedFnsResult<RouteSuccess, RouteError, LinkedFns extends Record<string, HSubRequest<any>>> = [
    RouteSuccess | undefined,
    RouteError | ValidationError | undefined,
    {[K in keyof LinkedFns]?: LinkedFnSuccess<LinkedFns[K]>} | undefined,
    {[K in keyof LinkedFns]?: LinkedFnError<LinkedFns[K]>} | undefined,
];

// type-workflow-result-start
/** Result type for workflow() function - 4-tuple pattern matching array input */
export type WorkflowResult<
    Routes extends RSubRequest<any>[],
    LinkedFns extends Record<string, HSubRequest<any>> = Record<string, HSubRequest<any>>,
> = [
    WorkflowRouteResults<Routes>,
    WorkflowRouteErrors<Routes>,
    {[K in keyof LinkedFns]?: LinkedFnSuccess<LinkedFns[K]>} | undefined,
    {[K in keyof LinkedFns]?: LinkedFnError<LinkedFns[K]>} | undefined,
];
// type-workflow-result-end

// type-workflow-route-results-start
/** Extract success types from route subrequests as tuple */
export type WorkflowRouteResults<Routes extends RSubRequest<any>[]> = {
    [K in keyof Routes]: Routes[K] extends RSubRequest<infer PH> ? HandlerSuccessResponse<PH> | undefined : never;
};
// type-workflow-route-results-end

// type-workflow-route-errors-start
/** Extract error types from route subrequests as tuple */
export type WorkflowRouteErrors<Routes extends RSubRequest<any>[]> = {
    [K in keyof Routes]: Routes[K] extends RSubRequest<infer PH> ? Simplify<HandlerErrors<PH>> | undefined : never;
};
// type-workflow-route-errors-end

export type ClientOptions = {
    baseURL: string;
    fetchOptions: RequestInit;
    /** prefix for all routes, i.e: api/v1 */
    prefix: string;
    /** suffix for all routes, i.e: .json */
    suffix: string;
    /** enable automatic parameter validation, defaults to true */
    validateParams: boolean;
    /** automatically generate and uuid */
    autoGenerateErrorId: boolean;
    /** Default serializer mode */
    serializer: SerializerMode;
};

type PublicHandler = (...args: any[]) => Promise<any>;
type PublicMethod = PublicRoute | PublicLinkedFn | PublicHeadersFn;
type ExtractHandler<PM extends PublicMethod> = PM extends {handler: infer H} ? H : never;

export type InitOptions = Partial<ClientOptions> & {baseURL: string};
export type RequestHeaders = {[key: string]: string};
export type RequestBody = {[key: string]: any[]};

/** Extracts all parameters from a PublicRoute, PublicLinkedFn, or PublicHeadersFn */
export type RouteParamsType<PM extends PublicMethod> = Parameters<ExtractHandler<PM>>;
/** Extracts a single parameter at a given index from a PublicRoute, PublicLinkedFn, or PublicHeadersFn */
export type RouteParamType<PM extends PublicMethod, Index extends number> = Parameters<ExtractHandler<PM>>[Index];
/** Extracts the headers parameter (first param) from a PublicHeadersFn handler */
export type HeadersParamsType<PM extends PublicHeadersFn> = Parameters<ExtractHandler<PM>>[0];

export type HandlerResponse<PH extends PublicHandler> = Awaited<ReturnType<PH>>;
export type HandlerSuccessResponse<PH extends PublicHandler> = Exclude<HandlerResponse<PH>, RpcError<string>>;
export type HandlerFailResponse<PH extends PublicHandler> = Extract<HandlerResponse<PH>, RpcError<string>>;
export type SuccessResponse<MR extends SubRequest<any>> = Required<MR>['resolvedValue'];
export type SuccessResponses<List extends SubRequest<any>[]> = {[P in keyof List]: SuccessResponse<List[P]>};
export type FailResponse<MR extends SubRequest<any>> = Required<MR>['error'];
export type FailResponses<List extends SubRequest<any>[]> = {[P in keyof List]: FailResponse<List[P]>};
export type RequestErrors = Map<string, RpcError<string>>;

/** Handler function for a specific error type */
export type ErrorHandler<E extends RpcError<string, any>> = (error: E) => void;

/** Handler function for unknown/unhandled errors */
export type UnknownErrorHandler = (error: RpcError<string, any>) => void;

/** Handler function for successful results */
export type SuccessHandler<S> = (result: S) => void;

/** Utility type to force TypeScript to evaluate/resolve the type */
type Simplify<T> = T extends any ? T : never;

/** Extracts all RpcError types from a handler's return type as a union */
export type HandlerErrors<PH extends (...args: any[]) => Promise<any>> = Simplify<
    Extract<HandlerResponse<PH>, RpcError<string, any>> | ValidationError
>;

/** Represents a remote method (sub request) */
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

/** structure returned from the proxy, containing info of the remote route to execute */
export interface RSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
    /** Validates Route's parameters and returns type errors */
    typeErrors: () => Promise<RunTypeError[]>;

    /** Calls a remote route and returns a Result 4-tuple with full typing preserved */
    call: () => Promise<
        Result<
            HandlerSuccessResponse<PH>,
            Simplify<HandlerErrors<PH>>,
            Record<string, unknown>,
            Record<string, RpcError<string, unknown> | ValidationError>
        >
    >;

    /** Calls a remote route with linkedFns and returns a fully-typed 4-tuple result */
    callWithLinkedFns: <H extends Record<string, HSubRequest<any>>>(
        linkedFns: H
    ) => Promise<CallWithLinkedFnsResult<HandlerSuccessResponse<PH>, Simplify<HandlerErrors<PH>>, H>>;

    /** Calls this route as part of a workflow with other routes in a single HTTP request */
    callWithWorkflow: <OtherRoutes extends RSubRequest<any>[], H extends Record<string, HSubRequest<any>>>(
        otherRoutes: [...OtherRoutes],
        linkedFns?: H
    ) => Promise<WorkflowResult<any, H>>;
}

/** structure returned from the proxy, containing info of the remote linkedFn to execute */
export interface HSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
    /** Validates LinkedFn's parameters and returns type errors */
    typeErrors: () => Promise<RunTypeError[]>;
    /** Prefills LinkedFn's parameters for any future request and returns TypedEvent */
    prefill: () => TypedEvent<HandlerSuccessResponse<PH>, Simplify<HandlerErrors<PH>>>;
    /** Removes prefilled value */
    removePrefill: () => Promise<void>;
}

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
