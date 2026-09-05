/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionjs/core';
import type {CoreRouterOptions, InputFromRef, Prettify, RunTypeError, SerializerMode, ValidationError} from '@mionjs/core';
import type {PublicHeadersFn, PublicMiddleFn, RemoteApi, PublicRoute} from '@mionjs/router';
import type {TypedEvent} from './lib/typedEvent.ts';

// type-fatal-error-start
/** Any error that is not part of a declared response: transport, platform, framework, or an
 * undeclared throw (a middleFn's DECLARED errors are not fatal - they land in the middleFnErrors
 * record and its onError listeners). Open by nature, the code can be anything. **/
export type FatalError = RpcError<string>;
// type-fatal-error-end

// type-result-start
/** Result type for call() - 5-tuple pattern:
 * [routeResult, routeError (declared | ValidationError), fatal, middleFnResults, middleFnErrors] **/
export type Result<
  RouteSuccess,
  RouteError,
  MiddleFnsResults extends Record<string, unknown> = Record<string, unknown>,
  MiddleFnsErrors extends Record<string, unknown> = Record<string, RpcError<string, unknown>>,
> = [
  RouteSuccess | undefined,
  RouteError | undefined,
  FatalError | undefined,
  MiddleFnsResults | undefined,
  MiddleFnsErrors | undefined,
];
// type-result-end

/** Extract success type from a MiddleFnSubRequest */
export type MiddleFnSuccess<H> = H extends MiddlewareSubRequest<infer PH> ? HandlerSuccessResponse<PH> : never;

/** Extract error type from a MiddleFnSubRequest */
export type MiddleFnError<H> = H extends MiddlewareSubRequest<infer PH> ? Simplify<HandlerErrors<PH>> : never;

// type-batch-result-start
/** Result type for batch() - 5-tuple pattern:
 * [routeResults[], routeErrors[] (declared | ValidationError), fatal (request-scoped, ONE slot), middleFnResults, middleFnErrors] **/
export type BatchResult<
  Routes extends RouteSubRequest<any>[],
  MiddleFns extends Record<string, MiddlewareSubRequest<any>> = Record<string, MiddlewareSubRequest<any>>,
> = [
  BatchRouteResults<Routes>,
  BatchRouteErrors<Routes>,
  FatalError | undefined,
  {[K in keyof MiddleFns]?: MiddleFnSuccess<MiddleFns[K]>} | undefined,
  {[K in keyof MiddleFns]?: MiddleFnError<MiddleFns[K]>} | undefined,
];
// type-batch-result-end

// type-batch-route-results-start
/** Extract success types from route subrequests as tuple */
export type BatchRouteResults<Routes extends RouteSubRequest<any>[]> = {
  [K in keyof Routes]: Routes[K] extends RouteSubRequest<infer PH> ? HandlerSuccessResponse<PH> | undefined : never;
};
// type-batch-route-results-end

// type-batch-route-errors-start
/** Extract error types from route subrequests as tuple */
export type BatchRouteErrors<Routes extends RouteSubRequest<any>[]> = {
  [K in keyof Routes]: Routes[K] extends RouteSubRequest<infer PH> ? Simplify<HandlerErrors<PH>> | undefined : never;
};
// type-batch-route-errors-end

export interface ClientOptions extends CoreRouterOptions {
  /** Base URL of the server, i.e: http://localhost:3000 */
  baseURL: string;
  /** basePath for all routes, i.e: api/v1 */
  basePath: string;
  /** suffix for all routes, i.e: .json */
  suffix: string;
  /** automatically generate and uuid */
  autoGenerateErrorId: boolean;
  /**  default fetch options */
  fetchOptions: RequestInit;
  /** enable automatic parameter validation, defaults to true */
  validateParams: boolean;
  /** Apply a route's declared format transforms (trim / case / replace / stripSeparators) to its
   *  params locally, before local validation and before sending, for routes the server registered
   *  with `sanitizeParams`. Defaults to true. The server sanitizes those routes regardless, so
   *  turning this off only changes what the client validates and sends, never what the handler gets. */
  sanitizeParams: boolean;
  /** Default serializer mode */
  serializer: SerializerMode;
  /** Default timeout in ms for all requests. Per-request timeout in CallSetup overrides this. */
  timeout?: number;
}

type PublicHandler = (...args: any[]) => Promise<any>;
type PublicMethod = PublicRoute | PublicMiddleFn | PublicHeadersFn;
type ExtractHandler<PM extends PublicMethod> = PM extends {handler: infer H} ? H : never;

export type InitClientOptions = Partial<ClientOptions> & {baseURL: string};
export type RequestHeaders = {[key: string]: string};
export type RequestBody = {[key: string]: any[]};

/** Extracts all parameters from a PublicRoute, PublicMiddleFn, or PublicHeadersFn */
export type RouteParamsType<PM extends PublicMethod> = Parameters<ExtractHandler<PM>>;
/** Extracts a single parameter at a given index from a PublicRoute, PublicMiddleFn, or PublicHeadersFn */
export type RouteParamType<PM extends PublicMethod, Index extends number> = Parameters<ExtractHandler<PM>>[Index];
/** Extracts the headers parameter (first param) from a PublicHeadersFn handler */
export type HeadersParamsType<PM extends PublicHeadersFn> = Parameters<ExtractHandler<PM>>[0];
/** Extracts the success return type from a PublicRoute, PublicMiddleFn, or PublicHeadersFn */
export type RouteReturnType<PM extends PublicMethod> = HandlerSuccessResponse<ExtractHandler<PM>>;

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

/** Handler function for successful results */
export type SuccessHandler<S> = (result: S) => void;

/** Utility type to force TypeScript to evaluate/resolve the type */
type Simplify<T> = T extends any ? T : never;

/** Extracts all RpcError types from a handler's return type as a union */
export type HandlerErrors<PH extends (...args: any[]) => Promise<any>> = Simplify<
  Extract<HandlerResponse<PH>, RpcError<string, any>> | ValidationError
>;

// type-sub-request-start
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
  /** inputFrom() refs passed as params; their slots hold null until the server maps them in */
  mappings?: InputFromRef[];
}
// type-sub-request-end

/** Unified config object for call() */
export interface CallSetup<H extends Record<string, MiddlewareSubRequest<any>> = Record<string, never>> {
  middleFns?: H;
  /** AbortSignal to cancel this specific request */
  signal?: AbortSignal;
  /** Timeout in ms (overrides ClientOptions.timeout) */
  timeout?: number;
}

/** Builder returned by batch() - call .call() to execute */
export interface BatchBuilder<Routes extends RouteSubRequest<any>[]> {
  /** Execute the batch */
  call(setup?: {middleFns?: never; signal?: AbortSignal; timeout?: number}): Promise<BatchResult<Routes>>;
  /** Execute the batch with middleware */
  call<H extends Record<string, MiddlewareSubRequest<any>>>(setup: {
    middleFns: H;
    signal?: AbortSignal;
    timeout?: number;
  }): Promise<BatchResult<Routes, H>>;
}

// type-route-sub-request-start
/** structure returned from the proxy, containing info of the remote route to execute */
export interface RouteSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
  /** Validates Route's parameters and returns type errors */
  typeErrors: () => Promise<RunTypeError[]>;

  /** Calls a remote route and returns a Result 5-tuple */
  call(setup?: {
    middleFns?: never;
    signal?: AbortSignal;
    timeout?: number;
  }): Promise<Result<HandlerSuccessResponse<PH>, Simplify<HandlerErrors<PH>>>>;

  /** Calls a remote route with middleFns */
  call<H extends Record<string, MiddlewareSubRequest<any>>>(setup: {
    middleFns: H;
    signal?: AbortSignal;
    timeout?: number;
  }): Promise<
    Result<
      HandlerSuccessResponse<PH>,
      Simplify<HandlerErrors<PH>>,
      {[K in keyof H]?: MiddleFnSuccess<H[K]>},
      {[K in keyof H]?: MiddleFnError<H[K]>}
    >
  >;
}
// type-route-sub-request-end

// type-middleware-sub-request-start
/** structure returned from the proxy, containing info of the remote middleFn to execute */
export interface MiddlewareSubRequest<PH extends PublicHandler> extends SubRequest<PH> {
  /** Validates MiddleFn's parameters and returns type errors */
  typeErrors: () => Promise<RunTypeError[]>;
  /** Prefills MiddleFn's parameters for any future request and returns TypedEvent */
  prefill: () => TypedEvent<HandlerSuccessResponse<PH>, Simplify<HandlerErrors<PH>>>;
  /** Removes prefilled value */
  removePrefill: () => Promise<void>;
  /** Returns the TypedEvent for this middleFn so typed handlers can be registered without prefilling */
  events: () => TypedEvent<HandlerSuccessResponse<PH>, Simplify<HandlerErrors<PH>>>;
  /** Registers a persistent typed error handler for this middleFn, no prefill required */
  onError: TypedEvent<HandlerSuccessResponse<PH>, Simplify<HandlerErrors<PH>>>['onError'];
  /** Removes a previously registered error handler */
  offError: TypedEvent<HandlerSuccessResponse<PH>, Simplify<HandlerErrors<PH>>>['offError'];
  /** Registers a persistent success handler for this middleFn, no prefill required */
  onSuccess: TypedEvent<HandlerSuccessResponse<PH>, Simplify<HandlerErrors<PH>>>['onSuccess'];
  /** Removes a previously registered success handler */
  offSuccess: TypedEvent<HandlerSuccessResponse<PH>, Simplify<HandlerErrors<PH>>>['offSuccess'];
}
// type-middleware-sub-request-end

export type NonClientRoute = PublicMiddleFn | PublicHeadersFn;

export type ClientRoutes<RA extends RemoteApi> = Prettify<{
  [Property in keyof RA as RA[Property] extends NonClientRoute ? never : Property]: RA[Property] extends PublicRoute
    ? (...params: Parameters<RA[Property]['handler']>) => RouteSubRequest<RA[Property]['handler']>
    : RA[Property] extends RemoteApi
      ? ClientRoutes<RA[Property]>
      : never;
}>;

export type NonClientMiddleFn = PublicRoute | {[key: string]: PublicRoute};

export type ClientMiddleFns<RA extends RemoteApi> = Prettify<{
  [Property in keyof RA as RA[Property] extends NonClientMiddleFn ? never : Property]: RA[Property] extends
    | PublicMiddleFn
    | PublicHeadersFn
    ? (...params: Parameters<RA[Property]['handler']>) => MiddlewareSubRequest<RA[Property]['handler']>
    : RA[Property] extends RemoteApi
      ? ClientMiddleFns<RA[Property]>
      : never;
}>;

export type Cleaned<RMS extends RemoteApi> = {
  [Property in keyof RMS as RMS[Property] extends never ? never : Property]: RMS[Property];
};

export type SuccessClientResponse<RS extends RouteSubRequest<any>, RHList extends MiddlewareSubRequest<any>[]> = [
  SuccessResponse<RS>,
  ...SuccessResponses<RHList>,
];

export type PrefilledMiddleFnsCache = Map<string, SubRequest<any>>;
