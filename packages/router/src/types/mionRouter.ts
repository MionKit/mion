/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CompTimeArgs} from '@mionjs/run-types';
import type {EncoderLiteralGuard, HeaderMarkerSlots, MarkerSlots} from './encoder.ts';
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
import type {
  PlainHeadersMiddleFnOptions,
  PlainMiddleFnOptions,
  PlainRouteOptions,
  RawMiddleFnOptions,
  MiddleFnOptions,
  HeadersMiddleFnOptions,
  RouteOptions,
} from './remoteMethods.ts';
import type {PublicApi} from './publicMethods.ts';

// ####### The typed router factory #######
// `createMionRouter(opts)` is the ONE way to initialize the router and declare routes / middleFns.
// The options literal rides BY TYPE (`O`) into every helper, so `ctx.shared` is typed from
// `contextDataFactory` and the router-wide `encoder` reaches what the build compiles for a route.
//
// These interfaces are the ONE place a helper signature is written. lib/handlers.ts holds the
// bodies and is TYPED BY them, so there is no second signature to keep in step. `O` can only reach
// a declaration this way: TypeScript has no partial type application, so a plain exported function
// cannot capture it and every helper has to be a method of the object the factory returns.
//
// ⚠️ The trailing marker parameters come from MarkerSlots / HeaderMarkerSlots (encoder.ts), which is
// where they are written. `opts` is CompTimeArgs so the build rejects a non-literal (CTA001 /
// CTA004), and it must stay immediately before the first marker slot: the resolver reads the
// options argument at (first marker index - 1).

/** The options accepted by `createMionRouter`: every router option is optional. */
export type RouterOptionsInput = Partial<RouterOptions>;
/** The factory's parameter type: the options literal, with a widened `encoder` rejected. */
export type RouterOptionsArg<O extends RouterOptionsInput> = O & EncoderLiteralGuard<O>;

/** The shared call-context data type the factory's `contextDataFactory` produces, `any` when there is none. */
export type ContextDataOf<O extends RouterOptionsInput> = O extends {contextDataFactory: ContextDataFactory<infer ContextData>}
  ? ContextData
  : any;

/** The CallContext every handler declared through `createMionRouter(opts)` receives: `ctx.shared` is typed from the options. */
export type RouterCallContext<O extends RouterOptionsInput> = CallContext<ContextDataOf<O>>;

// `RO` is the route's own options literal, defaulting to the no-encoder shape so a route naming no
// `encoder` resolves its slots from `O`, the factory literal. That is the only place the two levels
// meet: the slot types take both and fall back route, then router, then the built-in default.

/** The four injection slots of a route / middleFn, read from the handler's params and return. */
type RouteSlots<O, H extends Handler, RO> = MarkerSlots<HandlerParams<H>, HandlerReturn<H>, RO, O>;
/** The same four slots for a headers middleFn, whose public params start after the HeadersSubset. */
type HeadersRouteSlots<O, H extends HeaderHandler, RO> = MarkerSlots<HeaderHandlerParams<H>, HandlerReturn<H>, RO, O>;
/** The two extra slots a headers middleFn carries for its HeadersSubset parameter. */
type HeaderSlots<H extends HeaderHandler> = HeaderMarkerSlots<HeaderHandlerHeaders<H>>;

/** `mion.route` / `mion.query` / `mion.mutation`: declares a route whose handler context is typed from the router options. */
export interface RouteHelper<O extends RouterOptionsInput> {
  <H extends Handler<RouterCallContext<O>>, const RO extends RouteOptions = PlainRouteOptions>(
    handler: H,
    opts?: CompTimeArgs<RO>,
    paramsFns?: RouteSlots<O, H, RO>[0],
    returnFns?: RouteSlots<O, H, RO>[1],
    paramsId?: RouteSlots<O, H, RO>[2],
    returnId?: RouteSlots<O, H, RO>[3]
  ): RouteDef<H>;
}

/** `mion.middleFn`: declares a middleFn whose handler context is typed from the router options. */
export interface MiddleFnHelper<O extends RouterOptionsInput> {
  <H extends Handler<RouterCallContext<O>>, const RO extends MiddleFnOptions = PlainMiddleFnOptions>(
    handler: H,
    opts?: CompTimeArgs<RO>,
    paramsFns?: RouteSlots<O, H, RO>[0],
    returnFns?: RouteSlots<O, H, RO>[1],
    paramsId?: RouteSlots<O, H, RO>[2],
    returnId?: RouteSlots<O, H, RO>[3]
  ): MiddleFnDef<H>;
}

/**
 * `mion.headersFn`: declares a headers middleFn with the context typed from the router options.
 * The handler's 2nd param must be a HeadersSubset<Required, Optional>; the required/optional header
 * names are extracted at build time from its runtype graph. A HeadersSubset return gets its headers
 * written onto the response.
 *
 * @example
 * ```ts
 * mion.headersFn((ctx, h: HeadersSubset<'authorization'>): void => {
 *   // h.headers.authorization contains the value of the 'authorization' header
 * })
 * ```
 */
export interface HeadersFnHelper<O extends RouterOptionsInput> {
  <H extends HeaderHandler<RouterCallContext<O>>, const RO extends HeadersMiddleFnOptions = PlainHeadersMiddleFnOptions>(
    handler: H,
    opts?: CompTimeArgs<RO>,
    headersFns?: HeaderSlots<H>[0],
    paramsFns?: HeadersRouteSlots<O, H, RO>[0],
    returnFns?: HeadersRouteSlots<O, H, RO>[1],
    headersId?: HeaderSlots<H>[1],
    paramsId?: HeadersRouteSlots<O, H, RO>[2],
    returnId?: HeadersRouteSlots<O, H, RO>[3]
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
  /** Initializes the router with the factory options and registers the routes. Once per app, and
   *  synchronous: the compiled type functions were injected at build time, so nothing is loaded here. */
  initRoutes<R extends Routes>(routes: R): PublicApi<R>;
}
// type-mion-router-end
