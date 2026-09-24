/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CompTimeArgs, InjectBuildVersion, InjectRunTypeId} from '@mionjs/run-types';
import type {ParserLiteralGuard, HeaderMarkerSlots, MarkerSlots} from './parser.ts';
import type {CallContext, ContextDataFactory} from './context.ts';
import type {RouterOptions, Routes} from './general.ts';
import type {
  Handler,
  HandlerParams,
  HandlerReturn,
  HandlerIsAsync,
  HeaderHandler,
  HeaderHandlerHeaders,
  HeaderHandlerParams,
  RawMiddlewareHandler,
} from './handlers.ts';
import type {HeadersMiddlewareDef, MiddlewareDef, RawMiddlewareDef, RouteDef} from './definitions.ts';
import type {
  PlainHeadersMiddlewareOptions,
  PlainMiddlewareOptions,
  PlainRouteOptions,
  RawMiddlewareOptions,
  MiddlewareOptions,
  HeadersMiddlewareOptions,
  RouteOptions,
} from './remoteMethods.ts';
import type {ApiWithOptions, PublicApi} from './publicMethods.ts';

// ####### The typed router factory #######
// `createMionRouter(opts)` is the ONE way to initialize the router and declare routes / middlewares.
// The options literal rides BY TYPE (`O`) into every helper, so `ctx.shared` is typed from
// `contextDataFactory` and the router-wide `parser` reaches what the build compiles for a route.
// These interfaces are the ONE place a helper signature is written; lib/handlers.ts holds the bodies
// and is TYPED BY them. `O` can only reach a declaration through a method of the object the factory
// returns: TypeScript has no partial type application, so a plain exported function cannot capture it.
//
// ⚠️ The trailing marker parameters are written in MarkerSlots / HeaderMarkerSlots (parser.ts).
// `opts` is CompTimeArgs so the build rejects a non-literal (CTA001 / CTA004), and it must stay
// immediately before the first marker slot: the resolver reads the options argument at (first marker index - 1).

/** The options accepted by `createMionRouter`: every router option is optional. */
export type RouterOptionsInput = Partial<RouterOptions>;
/** The factory's parameter type: the options literal, with a widened `parser` rejected. */
export type RouterOptionsArg<O extends RouterOptionsInput> = O & ParserLiteralGuard<O>;

/** The shared call-context data type the factory's `contextDataFactory` produces, `any` when there is none. */
export type ContextDataOf<O extends RouterOptionsInput> = O extends {contextDataFactory: ContextDataFactory<infer ContextData>}
  ? ContextData
  : any;

/** The CallContext every handler declared through `createMionRouter(opts)` receives: `ctx.shared` is typed from the options. */
export type RouterCallContext<O extends RouterOptionsInput> = CallContext<ContextDataOf<O>>;

// `RO` is the route's own options literal, defaulting to the no-parser shape, so a route naming no `parser` takes its
// slots from `O`, the factory literal; the slot types fall back route, then router, then the built-in default.

/** The four injection slots of a route / middleware, read from the handler's params and return. */
type RouteSlots<O, H extends Handler, RO> = MarkerSlots<HandlerParams<H>, HandlerReturn<H>, RO, O>;
/** The same four slots for a headers middleware, whose public params start after the HeadersSubset. */
type HeadersRouteSlots<O, H extends HeaderHandler, RO> = MarkerSlots<HeaderHandlerParams<H>, HandlerReturn<H>, RO, O>;
/** The two extra slots a headers middleware carries for its HeadersSubset parameter. */
type HeaderSlots<H extends HeaderHandler> = HeaderMarkerSlots<HeaderHandlerHeaders<H>>;

/** `mion.route` / `mion.query` / `mion.mutation`: declares a route whose handler context is typed from the router options.
 *  `M` is the `isMutation` the helper pins (`query` false, `mutation` true, `route` nothing), carried on the returned options. */
export interface RouteHelper<O extends RouterOptionsInput, M extends boolean | undefined = undefined> {
  <H extends Handler<RouterCallContext<O>>, const RO extends RouteOptions = PlainRouteOptions>(
    handler: H,
    opts?: CompTimeArgs<RO>,
    paramsFns?: RouteSlots<O, H, RO>[0],
    returnFns?: RouteSlots<O, H, RO>[1],
    paramsId?: RouteSlots<O, H, RO>[2],
    returnId?: RouteSlots<O, H, RO>[3],
    isAsyncId?: InjectRunTypeId<HandlerIsAsync<H>>,
    syncId?: InjectRunTypeId<[HandlerParams<H>, HandlerReturn<H>]>
  ): RouteDef<H, PinnedMutation<RO, M>, O>;
}

/** The route options literal with `isMutation` pinned by the helper (`route()` leaves it as written). */
export type PinnedMutation<RO, M extends boolean | undefined> = M extends boolean ? RO & {isMutation: M} : RO;

/** `mion.middleware`: declares a middleware whose handler context is typed from the router options. */
export interface MiddlewareHelper<O extends RouterOptionsInput> {
  <H extends Handler<RouterCallContext<O>>, const RO extends MiddlewareOptions = PlainMiddlewareOptions>(
    handler: H,
    opts?: CompTimeArgs<RO>,
    paramsFns?: RouteSlots<O, H, RO>[0],
    returnFns?: RouteSlots<O, H, RO>[1],
    paramsId?: RouteSlots<O, H, RO>[2],
    returnId?: RouteSlots<O, H, RO>[3],
    isAsyncId?: InjectRunTypeId<HandlerIsAsync<H>>,
    syncId?: InjectRunTypeId<[HandlerParams<H>, HandlerReturn<H>]>
  ): MiddlewareDef<H, RO, O>;
}

/**
 * `mion.headersFn`: declares a headers middleware with the context typed from the router options.
 * The handler's 2nd param must be a HeadersSubset<Required, Optional>, whose header names are read at
 * build time from its runtype graph. A HeadersSubset return gets its headers written onto the response.
 * @example
 * ```ts
 * mion.headersFn((ctx, h: HeadersSubset<'authorization'>): void => {
 *   // h.headers.authorization contains the value of the 'authorization' header
 * })
 * ```
 */
export interface HeadersFnHelper<O extends RouterOptionsInput> {
  <H extends HeaderHandler<RouterCallContext<O>>, const RO extends HeadersMiddlewareOptions = PlainHeadersMiddlewareOptions>(
    handler: H,
    opts?: CompTimeArgs<RO>,
    headersFns?: HeaderSlots<H>[0],
    paramsFns?: HeadersRouteSlots<O, H, RO>[0],
    returnFns?: HeadersRouteSlots<O, H, RO>[1],
    headersId?: HeaderSlots<H>[1],
    paramsId?: HeadersRouteSlots<O, H, RO>[2],
    returnId?: HeadersRouteSlots<O, H, RO>[3],
    isAsyncId?: InjectRunTypeId<HandlerIsAsync<H>>,
    syncId?: InjectRunTypeId<[HeaderHandlerParams<H>, HandlerReturn<H>]>
  ): HeadersMiddlewareDef<H, RO, O>;
}

/** `mion.rawMiddleware`: declares a raw middleware (raw request/response access, no typed params, nothing compiled). */
export interface RawMiddlewareHelper<O extends RouterOptionsInput> {
  <H extends RawMiddlewareHandler<RouterCallContext<O>>>(handler: H, opts?: RawMiddlewareOptions): RawMiddlewareDef<H>;
}

// type-mion-router-start
/** What `createMionRouter(opts)` returns: the route / middleware helpers plus `initRoutes`, all carrying the options type. */
export interface MionRouter<O extends RouterOptionsInput = RouterOptionsInput> {
  /** The options given to the factory, frozen. */
  readonly options: Readonly<O>;
  readonly route: RouteHelper<O>;
  /** Read-only route: the client sends it as a GET when the payload fits in the url. */
  readonly query: RouteHelper<O, false>;
  /** Route that changes data: always sent as a POST. */
  readonly mutation: RouteHelper<O, true>;
  readonly middleware: MiddlewareHelper<O>;
  readonly headersFn: HeadersFnHelper<O>;
  readonly rawMiddleware: RawMiddlewareHelper<O>;
  /** Once per app, and synchronous: the compiled type functions were injected at build time, so nothing loads here.
   *  `buildVersion` is filled by the build, never by hand: the server answers with it so a client can spot stale routes. */
  initRoutes<R extends Routes>(routes: R, buildVersion?: InjectBuildVersion<PublicApi<R>>): ApiWithOptions<R, O>;
}
// type-mion-router-end
