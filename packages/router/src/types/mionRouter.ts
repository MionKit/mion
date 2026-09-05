/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';
import type {CallContext, ContextDataFactory} from './context.ts';
import type {RouterOptions, Routes} from './general.ts';
import type {
  Handler,
  HandlerParams,
  HandlerReturn,
  HeaderHandler,
  HeaderHandlerHeaders,
  HeaderHandlerParams,
  RawMiddleFnHandler,
} from './handlers.ts';
import type {HeadersMiddleFnDef, MiddleFnDef, RawMiddleFnDef, RouteDef} from './definitions.ts';
import type {HeadersMiddleFnOptions, MiddleFnOptions, RawMiddleFnOptions, RouteOptions} from './remoteMethods.ts';
import type {PublicApi} from './publicMethods.ts';

// ####### The typed router factory #######
// `createMionRouter(opts)` is the ONE way to initialize the router and to declare routes and
// middleFns. The options literal is written once and rides BY TYPE (`O`) into every helper the
// factory returns, so a router-wide setting can reach what the build compiles for a route.
//
// ⚠️ The markers below must be spelled out (InjectTypeFnArgs<...> / InjectRunTypeId<...>) — the
// mion scanner reads the RESOLVED signature of each `mion.route(...)` call, and a local type alias
// over a marker is not recognized. The fn keys and their ORDER are defined by MION_FN_KEYS in
// @mionjs/core; change it there and mirror it here and in lib/handlers.ts.

/** The options accepted by `createMionRouter`: every router option is optional. */
export type RouterOptionsInput = Partial<RouterOptions>;

/** The shared call-context data type the factory's `contextDataFactory` produces, `any` when there is none. */
export type ContextDataOf<O extends RouterOptionsInput> = O extends {contextDataFactory: ContextDataFactory<infer ContextData>}
  ? ContextData
  : any;

/** The CallContext every handler declared through `createMionRouter(opts)` receives: `ctx.shared` is typed from the options. */
export type RouterCallContext<O extends RouterOptionsInput> = CallContext<ContextDataOf<O>>;

/** `mion.route` / `mion.query` / `mion.mutation`: declares a route whose handler context is typed from the router options. */
export interface RouteHelper<O extends RouterOptionsInput> {
  <H extends Handler<RouterCallContext<O>>>(
    handler: H,
    opts?: RouteOptions,
    paramsFns?: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb', 'fmt'>,
    returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb'>,
    paramsId?: InjectRunTypeId<HandlerParams<H>>,
    returnId?: InjectRunTypeId<HandlerReturn<H>>
  ): RouteDef<H>;
}

/** `mion.middleFn`: declares a middleFn whose handler context is typed from the router options. */
export interface MiddleFnHelper<O extends RouterOptionsInput> {
  <H extends Handler<RouterCallContext<O>>>(
    handler: H,
    opts?: MiddleFnOptions,
    paramsFns?: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb', 'fmt'>,
    returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb'>,
    paramsId?: InjectRunTypeId<HandlerParams<H>>,
    returnId?: InjectRunTypeId<HandlerReturn<H>>
  ): MiddleFnDef<H>;
}

/** `mion.headersFn`: declares a headers middleFn (2nd handler param a HeadersSubset) with the context typed from the router options. */
export interface HeadersFnHelper<O extends RouterOptionsInput> {
  <H extends HeaderHandler<RouterCallContext<O>>>(
    handler: H,
    opts?: HeadersMiddleFnOptions,
    headersFns?: InjectTypeFnArgs<HeaderHandlerHeaders<H>, 'val', 'verr'>,
    paramsFns?: InjectTypeFnArgs<HeaderHandlerParams<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb', 'fmt'>,
    returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb'>,
    headersId?: InjectRunTypeId<HeaderHandlerHeaders<H>>,
    paramsId?: InjectRunTypeId<HeaderHandlerParams<H>>,
    returnId?: InjectRunTypeId<HandlerReturn<H>>
  ): HeadersMiddleFnDef<H>;
}

/** `mion.rawMiddleFn`: declares a raw middleFn (raw request/response access, no typed params, nothing compiled). */
export interface RawMiddleFnHelper<O extends RouterOptionsInput> {
  <H extends RawMiddleFnHandler<RouterCallContext<O>>>(handler: H, opts?: RawMiddleFnOptions): RawMiddleFnDef<H>;
}

// type-mion-router-start
/** What `createMionRouter(opts)` returns: the route / middleFn helpers plus `initRoutes`, all carrying the options type. */
export interface MionRouter<O extends RouterOptionsInput = RouterOptionsInput> {
  /** The options given to the factory, frozen. */
  readonly options: Readonly<O>;
  readonly route: RouteHelper<O>;
  /** Read-only route: the client sends it as a GET when the payload fits in the url. */
  readonly query: RouteHelper<O>;
  /** Route that changes data: always sent as a POST. */
  readonly mutation: RouteHelper<O>;
  readonly middleFn: MiddleFnHelper<O>;
  readonly headersFn: HeadersFnHelper<O>;
  readonly rawMiddleFn: RawMiddleFnHelper<O>;
  /** Initializes the router with the factory options and registers the routes. Once per app. */
  initRoutes<R extends Routes>(routes: R): Promise<PublicApi<R>>;
}
// type-mion-router-end
