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
  PlainMiddlewareOptions,
  PlainRouteOptions,
  RawMiddlewareOptions,
  MiddlewareOptions,
  MiddlewareOptionKey,
  MiddlewareOptionsWithParser,
  RouteOptions,
  RouteOptionKey,
  RouteOptionsWithParser,
} from './remoteMethods.ts';
import type {ApiBuildVersion, PublicApi} from './publicMethods.ts';

// ####### The typed router factory #######
// `createMionRouter(opts)`, or the factory `customMionRouter<Types>()` returns, is the ONE way to initialize the
// router and declare routes / middlewares. The options literal rides BY TYPE (`O`) into every helper, so the
// router-wide `parser` reaches what the build compiles for a route; the declared types (`T`) ride beside it and
// type `ctx.shared` and the keys every handler takes.
// These interfaces are the ONE place a helper signature is written; lib/handlers.ts holds the bodies
// and is TYPED BY them. `O` can only reach a declaration through a method of the object the factory
// returns: TypeScript has no partial type application, so a plain exported function cannot capture it.
//
// ⚠️ The trailing marker parameters are written in MarkerSlots / HeaderMarkerSlots (parser.ts).
// `opts` is CompTimeArgs so the build rejects a non-literal (marker-comptime-arg-*), and it must stay
// immediately before the first marker slot: the resolver reads the options argument at (first marker index - 1).

/** What `customMionRouter<Types>()` declares; a dev fills only the parts they need. */
export interface CustomRouterTypes {
  /** The type of `ctx.shared`; the factory's `contextDataFactory` must return it. */
  shared?: Record<string, any>;
  /** Keys added to the router options. */
  router?: object;
  /** Keys added to the options of every handler kind. */
  handler?: object;
}
/** The types of a router created with plain `createMionRouter`: nothing declared. */
export type PlainRouterTypes = Record<never, never>;

/** The `ctx.shared` type: `never` when no `shared` part was declared. */
export type SharedOf<T> = T extends {shared: infer Shared extends Record<string, any>} ? Shared : never;
/** The keys the `handler` part adds, none when it is absent. */
export type HandlerKeysOf<T> = T extends {handler: infer Keys} ? Keys : unknown;
type RouterKeysOf<T> = T extends {router: infer Keys} ? Keys : unknown;

/** The widest router options shape, every option optional. */
export type RouterOptionsInput = Partial<RouterOptions>;
/** The options a factory accepts: `contextDataFactory` is required with a `shared` part and refused without one.
 *  Intersected, never `Omit`: a mapped type here costs every router declaration. */
export type RouterOptionsInputOf<T> = RouterOptionsInput &
  RouterKeysOf<T> &
  (T extends {shared: infer Shared extends Record<string, any>}
    ? {contextDataFactory: ContextDataFactory<Shared>}
    : {contextDataFactory?: never});
/** What plain `createMionRouter` accepts, written out so a router declaring nothing evaluates no conditional. */
export type PlainRouterOptionsInput = RouterOptionsInput & {contextDataFactory?: never};
/** The factory's parameter type: the options literal, with a widened `parser` and an unknown key rejected. */
export type RouterOptionsArg<O> = O & ParserLiteralGuard<O>;
/** Part of a factory's constraint, `O extends Input & KnownKeysOf<O, T>`: a key outside the router's makes `O` miss it, even next to a valid key.
 *  In the constraint, not the parameter, so inference and contextual typing never compute it. */
export type KnownKeysOf<O, T> = {
  // a wide key (`ReturnType<typeof createMionRouter>` reads `O` as any) names no option to check
  [Key in keyof O]: Key extends keyof RouterOptions | keyof RouterKeysOf<T>
    ? unknown
    : string extends Key
      ? unknown
      : UnknownOptionKey<Key>;
};

/** Intersected onto an options literal so a key outside `Allowed` is a type error, even next to a valid key:
 *  generic inference runs no excess-property check against the constraint. */
export type UnknownKeysGuard<Options, Allowed extends PropertyKey> = [keyof Options] extends [Allowed]
  ? unknown
  : {[Key in Exclude<keyof Options, Allowed>]: UnknownOptionKey<Key>};
/** What an unknown key is typed as, so the error names it: `Type 'false' is not assignable to type 'UnknownOptionKey<"corz">'`. */
export interface UnknownOptionKey<Key extends PropertyKey> {
  readonly unknownOptionKey: Key;
}

/** The options the helpers carry: `contextDataFactory` is dropped, so its inferred return type (a whole inferred
 *  database) never rides into a route's types; `ctx.shared` comes from the declared `shared` part. */
export type CarriedOptions<O> = O extends {contextDataFactory: any} ? Omit<O, 'contextDataFactory'> : O;

/** The CallContext every handler of a router receives: `ctx.shared` is typed from the `shared` part. */
export type RouterCallContext<T> = CallContext<SharedOf<T>>;

// Resolved once per router, since `T` is fixed: a router with no `handler` part pays nothing per route.
type RouteOptionsOf<T> = T extends {handler: infer Keys}
  ? (PlainRouteOptions & Keys) | (RouteOptionsWithParser & Keys)
  : RouteOptions;
type MiddlewareOptionsOf<T> = T extends {handler: infer Keys}
  ? (PlainMiddlewareOptions & Keys) | (MiddlewareOptionsWithParser & Keys)
  : MiddlewareOptions;
type RouteKeysOf<T> = RouteOptionKey | keyof HandlerKeysOf<T>;
type MiddlewareKeysOf<T> = MiddlewareOptionKey | keyof HandlerKeysOf<T>;

// `RO` is the route's own options literal, defaulting to the no-parser shape, so a route naming no `parser` takes its
// slots from `O`, the factory literal; the slot types fall back route, then router, then the built-in default.

/** The injection slots of a route / middleware, read from the handler's params and return. */
type RouteSlots<O, H extends Handler, RO> = MarkerSlots<HandlerParams<H>, HandlerReturn<H>, RO, O>;
/** The same slots for a headers middleware, whose public params start after the HeadersSubset. */
type HeadersRouteSlots<O, H extends HeaderHandler, RO> = MarkerSlots<HeaderHandlerParams<H>, HandlerReturn<H>, RO, O>;
/** The two extra slots a headers middleware carries for its HeadersSubset parameter. */
type HeaderSlots<H extends HeaderHandler> = HeaderMarkerSlots<HeaderHandlerHeaders<H>>;

/** `mion.route` / `mion.query` / `mion.mutation`: declares a route whose handler context is typed from the router options.
 *  `M` is the `isMutation` the helper pins (`query` false, `mutation` true, `route` nothing), carried on the returned options. */
export interface RouteHelper<O extends RouterOptionsInput, T = PlainRouterTypes, M extends boolean | undefined = undefined> {
  <H extends Handler<RouterCallContext<T>>, const RO extends object = PlainRouteOptions>(
    handler: H,
    opts?: CompTimeArgs<RO & NoInfer<RouteOptionsOf<T> & UnknownKeysGuard<RO, RouteKeysOf<T>>>>,
    paramsFns?: RouteSlots<O, H, RO>[0],
    returnFns?: RouteSlots<O, H, RO>[1],
    paramsId?: RouteSlots<O, H, RO>[2],
    returnId?: RouteSlots<O, H, RO>[3],
    isAsyncId?: InjectRunTypeId<HandlerIsAsync<H>>,
    syncId?: RouteSlots<O, H, RO>[4]
  ): RouteDef<H, PinnedMutation<RO, M>, O>;
}

/** The route options literal with `isMutation` pinned by the helper (`route()` leaves it as written). */
export type PinnedMutation<RO, M extends boolean | undefined> = M extends boolean ? RO & {isMutation: M} : RO;

/** `mion.middleware`: declares a middleware whose handler context is typed from the router options. */
export interface MiddlewareHelper<O extends RouterOptionsInput, T = PlainRouterTypes> {
  <H extends Handler<RouterCallContext<T>>, const RO extends object = PlainMiddlewareOptions>(
    handler: H,
    opts?: CompTimeArgs<RO & NoInfer<MiddlewareOptionsOf<T> & UnknownKeysGuard<RO, MiddlewareKeysOf<T>>>>,
    paramsFns?: RouteSlots<O, H, RO>[0],
    returnFns?: RouteSlots<O, H, RO>[1],
    paramsId?: RouteSlots<O, H, RO>[2],
    returnId?: RouteSlots<O, H, RO>[3],
    isAsyncId?: InjectRunTypeId<HandlerIsAsync<H>>,
    syncId?: RouteSlots<O, H, RO>[4]
  ): MiddlewareDef<H, RO, O>;
}

/**
 * `mion.headersMiddleware`: declares a headers middleware with the context typed from the router options.
 * The handler's 2nd param must be a HeadersSubset<Required, Optional>, whose header names are read at
 * build time from its runtype graph. A HeadersSubset return gets its headers written onto the response.
 * @example
 * ```ts
 * mion.headersMiddleware((ctx, h: HeadersSubset<'authorization'>): void => {
 *   // h.headers.authorization contains the value of the 'authorization' header
 * })
 * ```
 */
export interface HeadersMiddlewareHelper<O extends RouterOptionsInput, T = PlainRouterTypes> {
  <H extends HeaderHandler<RouterCallContext<T>>, const RO extends object = PlainMiddlewareOptions>(
    handler: H,
    opts?: CompTimeArgs<RO & NoInfer<MiddlewareOptionsOf<T> & UnknownKeysGuard<RO, MiddlewareKeysOf<T>>>>,
    headersFns?: HeaderSlots<H>[0],
    paramsFns?: HeadersRouteSlots<O, H, RO>[0],
    returnFns?: HeadersRouteSlots<O, H, RO>[1],
    headersId?: HeaderSlots<H>[1],
    paramsId?: HeadersRouteSlots<O, H, RO>[2],
    returnId?: HeadersRouteSlots<O, H, RO>[3],
    isAsyncId?: InjectRunTypeId<HandlerIsAsync<H>>,
    syncId?: HeadersRouteSlots<O, H, RO>[4]
  ): HeadersMiddlewareDef<H, RO, O>;
}

/** `mion.rawMiddleware`: declares a raw middleware (raw request/response access, no typed params, nothing compiled). */
export interface RawMiddlewareHelper<T = PlainRouterTypes> {
  <H extends RawMiddlewareHandler<RouterCallContext<T>>>(
    handler: H,
    opts?: RawMiddlewareOptions & HandlerKeysOf<T>
  ): RawMiddlewareDef<H>;
}

/** What a router factory returns: the route / middleware helpers plus `initRoutes`, all carrying the options and declared types.
 *  `C` is what the helpers carry: the options minus `contextDataFactory` on a router that shares data. */
export interface MionRouter<
  O extends RouterOptionsInput = RouterOptionsInput,
  T = PlainRouterTypes,
  C extends RouterOptionsInput = O,
> {
  /** The options given to the factory, frozen. */
  readonly options: Readonly<O>;
  readonly route: RouteHelper<C, T>;
  /** Read-only route: the client sends it as a GET when the payload fits in the url. */
  readonly query: RouteHelper<C, T, false>;
  /** Route that changes data: always sent as a POST. */
  readonly mutation: RouteHelper<C, T, true>;
  readonly middleware: MiddlewareHelper<C, T>;
  readonly headersMiddleware: HeadersMiddlewareHelper<C, T>;
  readonly rawMiddleware: RawMiddlewareHelper<T>;
  /** Once per app, and synchronous: the compiled type functions were injected at build time, so nothing loads here.
   *  `buildVersion` is filled by the build, never by hand: the server answers with it so a client can spot stale routes. */
  initRoutes<R extends Routes, const Version extends string = string>(
    routes: R,
    buildVersion?: InjectBuildVersion<PublicApi<R>> & Version
  ): PublicApi<R> & ApiBuildVersion<Version>;
}

/** What `customMionRouter<T>()` returns: `createMionRouter` with the declared types; the options are required
 *  when a `shared` part makes `contextDataFactory` required. */
export type CustomRouterFactory<T> = T extends {shared: any}
  ? <const O extends RouterOptionsInputOf<T> & KnownKeysOf<O, T>>(
      opts: RouterOptionsArg<O>
    ) => MionRouter<O, T, CarriedOptions<O>>
  : OptionalOptionsFactory<T>;
/** Overloads, not a defaulted `O`: a default cannot be proven to meet a constraint that reads `O` and `T`. */
interface OptionalOptionsFactory<T> {
  (): MionRouter<Record<never, never>, T>;
  <const O extends RouterOptionsInputOf<T> & KnownKeysOf<O, T>>(opts: RouterOptionsArg<O>): MionRouter<O, T>;
}
