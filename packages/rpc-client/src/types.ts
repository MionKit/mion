/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HandlerType, RpcError} from '@mionjs/core';
import type {InputFromRef, Prettify, RunTypeError, ValidationError} from '@mionjs/core';
import type {PublicHeadersMiddleware, PublicMiddleware, RemoteApi, PublicRoute} from '@mionjs/router';
import type {InjectApiMetadata} from '@mionjs/run-types';
import type {TypedEvent} from './lib/typedEvent.ts';
import type {MIDDLEWARE_HOOKS} from './constants.ts';
import type {StorageEngine} from './lib/storage.ts';

/** Result type for call(): [routeResult, routeError (declared | ValidationError), response] **/
export type Result<RouteSuccess, RouteError, RA = RemoteApi> = [
  RouteSuccess | undefined,
  RouteError | undefined,
  ClientResponse<RA>,
];

/** Result type for batch(): one call() Result per route, in order, all sharing the same response **/
export type BatchResult<Routes extends RouteSubRequest<any>[]> = {
  [K in keyof Routes]: Routes[K] extends RouteSubRequest<infer PH>
    ? Result<HandlerSuccessResponse<PH>, Simplify<HandlerErrors<PH>>, ApiOf<Routes>>
    : never;
};

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
  /** Validate answers by return type; a wrong answer is dropped, its `response-validation-error` in `@thrownErrors`. Default false. */
  validateServerResponses: boolean;
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

type PublicHandler = (...args: any[]) => Promise<any>;
type PublicMethod = PublicRoute | PublicMiddleware | PublicHeadersMiddleware;
type ExtractHandler<PM extends PublicMethod> = PM extends {handler: infer H} ? H : never;

export type InitClientOptions = Partial<ClientOptions> & {baseURL: string};
export type RequestHeaders = {[key: string]: string};
export type RequestBody = {[key: string]: any[]};

export type RouteParamsType<PM extends PublicMethod> = Parameters<ExtractHandler<PM>>;
export type RouteParamType<PM extends PublicMethod, Index extends number> = Parameters<ExtractHandler<PM>>[Index];
export type HeadersParamsType<PM extends PublicHeadersMiddleware> = Parameters<ExtractHandler<PM>>[0];
export type RouteReturnType<PM extends PublicMethod> = HandlerSuccessResponse<ExtractHandler<PM>>;

export type HandlerResponse<PH extends PublicHandler> = Awaited<ReturnType<PH>>;
export type HandlerSuccessResponse<PH extends PublicHandler> = Exclude<HandlerResponse<PH>, RpcError<string>>;
export type HandlerFailResponse<PH extends PublicHandler> = Extract<HandlerResponse<PH>, RpcError<string>>;
export type SuccessResponse<MR extends SubRequest<any>> = Required<MR>['resolvedValue'];
export type SuccessResponses<List extends SubRequest<any>[]> = {[P in keyof List]: SuccessResponse<List[P]>};
export type FailResponse<MR extends SubRequest<any>> = Required<MR>['error'];
export type FailResponses<List extends SubRequest<any>[]> = {[P in keyof List]: FailResponse<List[P]>};
export type RequestErrors = Map<string, RpcError<string>>;

/** The errors of `E` whose `type` can be `T`, including one error declared with several types */
export type ErrorOfType<E extends RpcError<string, any>, T extends E['type']> = E extends any
  ? T extends E['type']
    ? E
    : never
  : never;

/** Runs after each declared error of the middleware; a returned promise is awaited, any other value ignored */
export type ErrorHandler<E extends RpcError<string, any>> = (error: E, context: MiddlewareContext) => unknown;

/** Runs after each successful result of the middleware; a returned promise is awaited, any other value ignored */
export type ResponseHandler<S> = (result: S, context: MiddlewareContext) => unknown;

/** The call an onResponse or onError hook runs for */
export interface MiddlewareContext extends CallContext {
  /** Sends the whole call again, once per middleware; false when that could run a mutation twice */
  retry(): boolean;
}

/** Runs before each request with the middleware; no `call` sends it nothing, a throw or rejection stops the request */
export type RequestHandler<P extends any[] = any[]> = (
  call: (...params: P) => void,
  context: CallContext
) => void | Promise<void>;

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

/** Plain data for one call; onRequest hooks receive this same object through the read-only CallContext view */
export interface ClientCallContext extends CallContext {
  readonly path: string;
  readonly requestId: string;
  readonly subRequestList: Record<string, SubRequest<any>>;
  /** ids whose error is thrown/undeclared rather than a declared response */
  readonly thrownErrorIds: Set<string>;
  httpResponse: Response | undefined;
  /** Slot 2 of the result, one object per attempt */
  response: ClientResponse<RemoteApi>;
}

/** Utility type to force TypeScript to evaluate/resolve the type */
type Simplify<T> = T extends any ? T : never;

export type HandlerErrors<PH extends (...args: any[]) => Promise<any>> = Simplify<
  Extract<HandlerResponse<PH>, RpcError<string, any>> | ValidationError
>;

// A subrequest takes the handler, the route id as a literal (the key path the proxy joins with `/`) and the
// whole API. The proxy mints the id at runtime; the literal exists so it survives destructuring and aliasing,
// and so a `bundleApi` build reads which route of which API each dispatch point calls. Defaults keep
// every `RouteSubRequest<H>` use compiling.

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

/** structure returned from the proxy, containing info of the remote route to execute */
export interface RouteSubRequest<
  PH extends PublicHandler,
  Id extends string = string,
  RA extends RemoteApi = any,
> extends SubRequest<PH, Id> {
  /** Validates Route's parameters and returns type errors */
  typeErrors(apiMetadata?: InjectApiMetadata<RA, Id>): Promise<RunTypeError[]>;

  /** Calls a remote route and returns [result, error, response] */
  call(
    setup?: CallSetup,
    apiMetadata?: InjectApiMetadata<RA, Id>
  ): Promise<Result<HandlerSuccessResponse<PH>, Simplify<HandlerErrors<PH>>, RA>>;
}

/** A middleware's params for one request, built by the `call` its onRequest hook receives */
export type MiddlewareSubRequest<PH extends PublicHandler, Id extends string = string> = SubRequest<PH, Id>;

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type */
/** The persistent hooks of a middleware, keyed by its id */
export type MiddlewareEvents<PH extends PublicHandler> = TypedEvent<
  HandlerSuccessResponse<PH>,
  Simplify<HandlerErrors<PH>>,
  Parameters<PH>
>;

/** Hooks only, params come from onRequest; `Id` is type only, the build reads it to see which are set up */
export interface ClientMiddleware<PH extends PublicHandler, Id extends string = string> extends Pick<
  MiddlewareEvents<PH>,
  (typeof MIDDLEWARE_HOOKS)[number]
> {}

/** A middleware on the client, typed from its server handler, so an installer needs no router import */
export type ClientMiddlewareOf<H extends (ctx: any, ...params: any[]) => any> = H extends (
  ctx: any,
  ...params: infer P
) => infer R
  ? ClientMiddleware<(...params: P) => Promise<Awaited<R>>>
  : never;
/* eslint-enable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type */

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

export type ClientMiddlewares<RA, Prefix extends string = ''> = Prettify<{
  [Property in keyof RA & string as RA[Property] extends NonClientMiddleware ? never : Property]: RA[Property] extends {
    type: typeof HandlerType.middleware | typeof HandlerType.headersMiddleware;
    handler: infer H extends PublicHandler;
  }
    ? ClientMiddleware<H, `${Prefix}${Property & string}`>
    : RA[Property] extends AnyLeaf
      ? never
      : ClientMiddlewares<RA[Property], `${Prefix}${Property & string}/`>;
}>;

/** Slot 2: every middleware nested by group, each its whole return or a ValidationError, plus every untyped error */
export type ClientResponse<RA> = (string extends keyof RA
  ? // the API erased (`RemoteApi`): every concrete response is assignable to it
    {[key: string]: unknown}
  : ClientMiddlewareResponses<RA>) & {'@thrownErrors'?: RpcError<string>[]};

/** Built like `ClientMiddlewares`, every key optional: only what the response carried is there */
type ClientMiddlewareResponses<RA> = {
  [Property in keyof RA & string as RA[Property] extends NonClientMiddleware ? never : Property]?: RA[Property] extends {
    type: typeof HandlerType.middleware | typeof HandlerType.headersMiddleware;
    handler: infer H extends PublicHandler;
  }
    ? HandlerResponse<H> | ValidationError
    : RA[Property] extends AnyLeaf
      ? never
      : ClientMiddlewareResponses<RA[Property]>;
};

export type Cleaned<RMS extends RemoteApi> = {
  [Property in keyof RMS as RMS[Property] extends never ? never : Property]: RMS[Property];
};

export type SuccessClientResponse<RS extends RouteSubRequest<any>, RHList extends MiddlewareSubRequest<any>[]> = [
  SuccessResponse<RS>,
  ...SuccessResponses<RHList>,
];
