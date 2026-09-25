/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HandlerType, RpcError} from '@mionjs/core';
import type {InputFromRef, Prettify, RunTypeError, ValidationError} from '@mionjs/core';
import type {PublicHeadersFn, PublicMiddleware, RemoteApi, PublicRoute} from '@mionjs/router';
import type {InjectApiMetadata} from '@mionjs/run-types';
import type {TypedEvent} from './lib/typedEvent.ts';
import type {MIDDLEWARE_HOOKS} from './constants.ts';
import type {StorageEngine} from './lib/storage.ts';

// type-undeclared-error-start
/** The `undeclared` slot: any error that is not part of a declared response: transport, platform,
 * framework, or an undeclared throw. A DECLARED error never lands here, a returned FatalError
 * included: those stay typed in their own route or middleware slot (and the onError listeners).
 * Open by nature, the code can be anything. **/
export type UndeclaredError = RpcError<string>;
// type-undeclared-error-end

// type-result-start
/** Result type for call() - 5-tuple pattern:
 * [routeResult, routeError (declared | ValidationError), undeclared, middlewareResults, middlewareErrors] **/
export type Result<
  RouteSuccess,
  RouteError,
  MiddlewaresResults extends Record<string, unknown> = Record<string, unknown>,
  MiddlewaresErrors extends Record<string, unknown> = Record<string, RpcError<string, unknown>>,
> = [
  RouteSuccess | undefined,
  RouteError | undefined,
  UndeclaredError | undefined,
  MiddlewaresResults | undefined,
  MiddlewaresErrors | undefined,
];
// type-result-end

// type-batch-result-start
/** Result type for batch() - 5-tuple pattern:
 * [routeResults[], routeErrors[] (declared | ValidationError), undeclared (request-scoped, ONE slot), middlewareResults, middlewareErrors] **/
export type BatchResult<Routes extends RouteSubRequest<any>[]> = [
  BatchRouteResults<Routes>,
  BatchRouteErrors<Routes>,
  UndeclaredError | undefined,
  Record<string, unknown> | undefined,
  Record<string, RpcError<string, unknown>> | undefined,
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

/** The client sets method, body and signal on every request. */
export type ClientFetchOptions = Omit<RequestInit, 'method' | 'body' | 'signal'>;

export interface ClientOptions {
  /** Base URL of the server, i.e: http://localhost:3000 */
  baseURL: string;
  /** basePath for all routes, i.e: api/v1 */
  basePath: string;
  /** suffix for all routes, i.e: .json */
  suffix: string;
  fetchOptions: ClientFetchOptions;
  /** enable automatic parameter validation, defaults to true */
  validateParams: boolean;
  /** Apply a route's declared format transforms (trim / case / replace / stripSeparators) to its
   *  params locally, before local validation and before sending, for routes the server registered
   *  with `sanitizeParams`. Defaults to true. The server sanitizes those routes regardless, so
   *  turning this off only changes what the client validates and sends, never what the handler gets. */
  sanitizeParams: boolean;
  /** Where the client keeps what it learned about the remote methods, so a later visit does not have
   *  to ask again. `indexeddb` (the default) uses the browser's own database, `memory` keeps it for
   *  the life of the process, or pass a function that opens a store of your own (see MetadataStore).
   *  Any engine falls back to memory wherever it cannot be opened. */
  storageEngine: StorageEngine;
  /** Default timeout in ms for all requests. Per-request timeout in CallSetup overrides this. */
  timeout?: number;
}

/** The build-injected slot at its widest: the API and route id erased, because the implementation is one
 *  class behind a proxy. The typed slot a caller sees is on RouteSubRequest / MiddlewareSubRequest. */
export type InjectedApiMetadata = InjectApiMetadata<RemoteApi, string>;

/** The lane a built client runs its metadata on. */
export type BundleApiMode = 'bundled' | 'mixed';

type PublicHandler = (...args: any[]) => Promise<any>;
type PublicMethod = PublicRoute | PublicMiddleware | PublicHeadersFn;
type ExtractHandler<PM extends PublicMethod> = PM extends {handler: infer H} ? H : never;

export type InitClientOptions = Partial<ClientOptions> & {baseURL: string};
export type RequestHeaders = {[key: string]: string};
export type RequestBody = {[key: string]: any[]};

export type RouteParamsType<PM extends PublicMethod> = Parameters<ExtractHandler<PM>>;
export type RouteParamType<PM extends PublicMethod, Index extends number> = Parameters<ExtractHandler<PM>>[Index];
export type HeadersParamsType<PM extends PublicHeadersFn> = Parameters<ExtractHandler<PM>>[0];
export type RouteReturnType<PM extends PublicMethod> = HandlerSuccessResponse<ExtractHandler<PM>>;

export type HandlerResponse<PH extends PublicHandler> = Awaited<ReturnType<PH>>;
export type HandlerSuccessResponse<PH extends PublicHandler> = Exclude<HandlerResponse<PH>, RpcError<string>>;
export type HandlerFailResponse<PH extends PublicHandler> = Extract<HandlerResponse<PH>, RpcError<string>>;
export type SuccessResponse<MR extends SubRequest<any>> = Required<MR>['resolvedValue'];
export type SuccessResponses<List extends SubRequest<any>[]> = {[P in keyof List]: SuccessResponse<List[P]>};
export type FailResponse<MR extends SubRequest<any>> = Required<MR>['error'];
export type FailResponses<List extends SubRequest<any>[]> = {[P in keyof List]: FailResponse<List[P]>};
export type RequestErrors = Map<string, RpcError<string>>;

export type ErrorHandler<E extends RpcError<string, any>> = (error: E) => void;

export type ResponseHandler<S> = (result: S) => void;

// type-request-handler-start
/** Runs before each request with the middleware; no `call` sends it nothing, a throw or rejection stops the request */
export type RequestHandler<P extends any[] = any[]> = (
  call: (...params: P) => void,
  context: CallContext
) => void | Promise<void>;
// type-request-handler-end

// type-call-context-start
/** The request a RequestHandler runs for, read only */
export interface CallContext {
  /** The route this request calls, undefined for a batch */
  readonly route?: RouteSubRequest<any>;
  /** The routes of a batch */
  readonly batchSubRequests?: RouteSubRequest<any>[];
  /** Every route and middleware this request sends so far, by id */
  readonly subRequestList: Readonly<Record<string, SubRequest<any>>>;
  readonly options: ClientOptions;
  readonly signal?: AbortSignal;
}
// type-call-context-end

/** Utility type to force TypeScript to evaluate/resolve the type */
type Simplify<T> = T extends any ? T : never;

export type HandlerErrors<PH extends (...args: any[]) => Promise<any>> = Simplify<
  Extract<HandlerResponse<PH>, RpcError<string, any>> | ValidationError
>;

// A subrequest takes the handler, the route id as a literal (the key path the proxy joins with `/`) and the
// whole API. The proxy mints the id at runtime; the literal exists so it survives destructuring and aliasing,
// and so a `bundleApi` build reads which route of which API each dispatch point calls. Defaults keep
// every `RouteSubRequest<H>` use compiling.

// type-sub-request-start
/** Represents a remote method (sub request) */
export interface SubRequest<PH extends PublicHandler, Id extends string = string> {
  pointer: string[];
  id: Id;
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

/** Middleware params never go here: each middleware gets them from its onRequest hook */
export interface CallSetup {
  signal?: AbortSignal;
  /** Timeout in ms (overrides ClientOptions.timeout) */
  timeout?: number;
}

/** The API a list of subrequests was created from (one API per client, so the union collapses). */
export type ApiOf<Routes extends SubRequest<any>[]> = Routes[number] extends RouteSubRequest<any, any, infer RA> ? RA : never;

export interface BatchBuilder<Routes extends RouteSubRequest<any>[]> {
  /** Execute the batch */
  call(setup?: CallSetup, apiMetadata?: InjectApiMetadata<ApiOf<Routes>, Routes[number]['id']>): Promise<BatchResult<Routes>>;
}

// type-route-sub-request-start
/** structure returned from the proxy, containing info of the remote route to execute */
export interface RouteSubRequest<
  PH extends PublicHandler,
  Id extends string = string,
  RA extends RemoteApi = RemoteApi,
> extends SubRequest<PH, Id> {
  /** Validates Route's parameters and returns type errors */
  typeErrors(apiMetadata?: InjectApiMetadata<RA, Id>): Promise<RunTypeError[]>;

  /** Calls a remote route and returns a Result 5-tuple */
  call(
    setup?: CallSetup,
    apiMetadata?: InjectApiMetadata<RA, Id>
  ): Promise<Result<HandlerSuccessResponse<PH>, Simplify<HandlerErrors<PH>>>>;
}
// type-route-sub-request-end

/** A middleware's params for one request, built by the `call` its onRequest hook receives */
export type MiddlewareSubRequest<PH extends PublicHandler, Id extends string = string> = SubRequest<PH, Id>;

// type-client-middleware-start
/** The persistent hooks of a middleware, keyed by its id */
export type MiddlewareEvents<PH extends PublicHandler> = TypedEvent<
  HandlerSuccessResponse<PH>,
  Simplify<HandlerErrors<PH>>,
  Parameters<PH>
>;

/** A middleware on the client: hooks only, its params come from onRequest on every request */
export type ClientMiddleware<PH extends PublicHandler> = Pick<MiddlewareEvents<PH>, (typeof MIDDLEWARE_HOOKS)[number]>;
// type-client-middleware-end

// The mapped types below tell a route, a middleware and a group apart by the `type` discriminant every public
// method carries (a group carries none), never structurally: a PublicRoute's options and compiled types are
// deep conditional types, and comparing them per member was the bulk of the client's type cost.
type RouteLeaf = {type: typeof HandlerType.route; handler: PublicHandler};
type MiddlewareLeaf = {type: typeof HandlerType.middleware | typeof HandlerType.headersMiddleware; handler: PublicHandler};
type AnyLeaf = {type: number};

/** What `ClientRoutes` leaves out: a middleware (headers middlewares included). */
export type NonClientRoute = MiddlewareLeaf;

// `Prefix` is the key path of the level being mapped (`users/` one level down) and `Root` the whole
// API: both ride down the recursion so every leaf names its full id and its API.
export type ClientRoutes<
  RA,
  Prefix extends string = '',
  Root extends RemoteApi = RA extends RemoteApi ? RA : RemoteApi,
> = Prettify<{
  // string keys only: skips the router options the API type carries under a symbol key
  [Property in keyof RA & string as RA[Property] extends NonClientRoute ? never : Property]: RA[Property] extends {
    type: typeof HandlerType.route;
    handler: infer H extends PublicHandler;
  }
    ? (...params: Parameters<H>) => RouteSubRequest<H, `${Prefix}${Property & string}`, Root>
    : RA[Property] extends AnyLeaf
      ? never
      : ClientRoutes<RA[Property], `${Prefix}${Property & string}/`, Root>;
}>;

/** What `ClientMiddlewares` leaves out: a route, and a group holding nothing but routes. */
export type NonClientMiddleware = RouteLeaf | {[key: string]: RouteLeaf};

export type ClientMiddlewares<RA> = Prettify<{
  [Property in keyof RA & string as RA[Property] extends NonClientMiddleware ? never : Property]: RA[Property] extends {
    type: typeof HandlerType.middleware | typeof HandlerType.headersMiddleware;
    handler: infer H extends PublicHandler;
  }
    ? ClientMiddleware<H>
    : RA[Property] extends AnyLeaf
      ? never
      : ClientMiddlewares<RA[Property]>;
}>;

export type Cleaned<RMS extends RemoteApi> = {
  [Property in keyof RMS as RMS[Property] extends never ? never : Property]: RMS[Property];
};

export type SuccessClientResponse<RS extends RouteSubRequest<any>, RHList extends MiddlewareSubRequest<any>[]> = [
  SuccessResponse<RS>,
  ...SuccessResponses<RHList>,
];
