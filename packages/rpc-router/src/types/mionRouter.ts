/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CompTimeArgs, InjectBuildVersion, InjectRunTypeId} from '@mionjs/run-types';
import type {ParserLiteralGuard, HeaderMarkerSlots, MarkerSlots} from './parser.ts';
import type {CallContext, SharedDataFactory} from './context.ts';
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
  RouteOptions,
} from './remoteMethods.ts';
import type {ApiBuildVersion, PublicApi} from './publicMethods.ts';

// ####### The typed router factory #######
// `createMionRouter` (or the factory `createMionRouter.withTypes<Types>()` returns) is the ONE way to create the router.
// The options (`O`) ride BY TYPE into every helper, so the build compiles each route with the router-wide `parser` and
// `ctx.shared` is typed from `sharedDataFactory`. The declared types (`T`) ride beside them: the keys handlers take.
// These interfaces are the ONE place a helper signature is written; lib/handlers.ts holds the bodies
// and is TYPED BY them. `O` can only reach a declaration through a method of the object the factory
// returns: TypeScript has no partial type application, so a plain exported function cannot capture it.
//
// ⚠️ The trailing marker parameters are written in MarkerSlots / HeaderMarkerSlots (parser.ts).
// `opts` is CompTimeArgs so the build rejects a non-literal (marker-comptime-arg-*), and it must stay
// immediately before the first marker slot: the resolver reads the options argument at (first marker index - 1).

/** What `createMionRouter.withTypes<Types>()` declares. */
export interface RouterTypes {
  /** Keys added to the router options. */
  router?: object;
  /** Keys added to the options of every handler kind. */
  handler?: object;
}
/** The router types the helpers read: `ctx.shared` (what `sharedDataFactory` returns, `never` without one) joins them
 *  once per router. Read off `O` in every helper instead, it makes the factory's unknown-key constraint cost far more. */
export type WithShared<O, T> = O extends {sharedDataFactory: SharedDataFactory<infer Shared>} ? T & {readonly shared: Shared} : T;
type SharedOf<T> = T extends {readonly shared: infer Shared extends Record<string, any>} ? Shared : never;
// Two helpers, not one keyed by part: the shared `Record<Part, infer Keys>` form costs the route step ~30 instantiations.
type HandlerKeysOf<T> = T extends {handler: infer Keys} ? Keys : unknown;
type RouterKeysOf<T> = T extends {router: infer Keys} ? Keys : unknown;

/** The widest router options shape. */
export type RouterOptionsInput = Partial<RouterOptions>;
/** The factory's parameter type: the options literal, with a widened `parser` rejected. */
export type RouterOptionsArg<O> = O & ParserLiteralGuard<O>;
/** In `withTypes`' constraint: a misspelled part, or a non-JSON `handler` key value (it reaches the client), is an error. */
export type CheckedRouterTypes<T> = {
  [Part in keyof T]: Part extends 'handler'
    ? {[Key in keyof T[Part]]: [Extract<T[Part][Key], NonJsonValue>] extends [never] ? T[Part][Key] : NotJsonOptionKey<Key>}
    : Part extends keyof RouterTypes
      ? T[Part]
      : UnknownTypesPart<Part>;
};
/** What a misspelled part (`handlr`) is typed as, so the error names it. */
interface UnknownTypesPart<Part extends PropertyKey> {
  readonly unknownTypesPart: Part;
}
type NonJsonValue = ((...args: any[]) => unknown) | bigint | symbol | RegExp | Date | Map<unknown, unknown> | Set<unknown>;
/** What a non-JSON added key is typed as, so the error names it. */
interface NotJsonOptionKey<Key extends PropertyKey> {
  readonly notJsonOptionKey: Key;
}
/** Rejects an unknown router option key, even next to a valid one.
 *  In the factory's constraint, not its parameter, so inference and contextual typing never compute it. */
export type KnownKeysOf<O, T> = {
  // a wide key (`ReturnType<typeof createMionRouter>` reads `O` as any) names no option to check
  [Key in keyof O]: Key extends keyof RouterOptions | keyof RouterKeysOf<T>
    ? unknown
    : string extends Key
      ? unknown
      : UnknownOptionKey<Key>;
};

/** Rejects a key outside `Allowed` even next to a valid one: generic inference runs no excess-property check. */
type UnknownKeysGuard<Options, Allowed extends PropertyKey> = [keyof Options] extends [Allowed]
  ? unknown
  : {[Key in Exclude<keyof Options, Allowed>]: UnknownOptionKey<Key>};
/** What an unknown key is typed as, so the error names it: `UnknownOptionKey<"corz">`. */
interface UnknownOptionKey<Key extends PropertyKey> {
  readonly unknownOptionKey: Key;
}

// An interface, not an alias: it resolves lazily, a few instantiations less on every router the type budget tracks.
export interface RouterCallContext<T> extends CallContext<SharedOf<T>> {
  shared: SharedOf<T>;
}

// Resolved once per router, since `T` is fixed: a router with no `handler` part pays nothing per route.
type RouteOptionsOf<T> = RouteOptions & HandlerKeysOf<T>;
type MiddlewareOptionsOf<T> = MiddlewareOptions & HandlerKeysOf<T>;
type RawMiddlewareOptionsOf<T> = RawMiddlewareOptions & HandlerKeysOf<T>;

// `RO` is the route's own options literal, defaulting to the no-parser shape, so a route naming no `parser` takes its
// slots from `O`, the factory literal; the slot types fall back route, then router, then the built-in default.

/** The injection slots of a route / middleware, read from the handler's params and return. */
type RouteSlots<O, H extends Handler, RO> = MarkerSlots<HandlerParams<H>, HandlerReturn<H>, RO, O>;
/** The same slots for a headers middleware, whose public params start after the HeadersSubset. */
type HeadersRouteSlots<O, H extends HeaderHandler, RO> = MarkerSlots<HeaderHandlerParams<H>, HandlerReturn<H>, RO, O>;
/** The two extra slots a headers middleware carries for its HeadersSubset parameter. */
type HeaderSlots<H extends HeaderHandler> = HeaderMarkerSlots<HeaderHandlerHeaders<H>>;

/** `mion.route` / `mion.query` / `mion.mutation`: declares a route whose handler context is typed from the router types.
 *  `M` is the `isMutation` the helper pins (`query` false, `mutation` true, `route` nothing), carried on the returned options. */
export interface RouteHelper<O extends RouterOptionsInput, T extends object = object, M extends boolean | undefined = undefined> {
  <H extends Handler<RouterCallContext<T>>, const RO extends object = PlainRouteOptions>(
    handler: H,
    opts?: CompTimeArgs<RO & NoInfer<RouteOptionsOf<T> & UnknownKeysGuard<RO, keyof RouteOptionsOf<T>>>>,
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

/** `mion.middleware`: declares a middleware whose handler context is typed from the router types. */
export interface MiddlewareHelper<O extends RouterOptionsInput, T extends object = object> {
  <H extends Handler<RouterCallContext<T>>, const RO extends object = PlainMiddlewareOptions>(
    handler: H,
    opts?: CompTimeArgs<RO & NoInfer<MiddlewareOptionsOf<T> & UnknownKeysGuard<RO, keyof MiddlewareOptionsOf<T>>>>,
    paramsFns?: RouteSlots<O, H, RO>[0],
    returnFns?: RouteSlots<O, H, RO>[1],
    paramsId?: RouteSlots<O, H, RO>[2],
    returnId?: RouteSlots<O, H, RO>[3],
    isAsyncId?: InjectRunTypeId<HandlerIsAsync<H>>,
    syncId?: RouteSlots<O, H, RO>[4]
  ): MiddlewareDef<H, RO, O>;
}

/**
 * `mion.headersMiddleware`: declares a headers middleware with the context typed from the router types.
 * The handler's 2nd param must be a HeadersSubset<Required, Optional>, whose header names are read at
 * build time from its runtype graph. A HeadersSubset return gets its headers written onto the response.
 * @example
 * ```ts
 * mion.headersMiddleware((ctx, h: HeadersSubset<'authorization'>): void => {
 *   // h.headers.authorization contains the value of the 'authorization' header
 * })
 * ```
 */
export interface HeadersMiddlewareHelper<O extends RouterOptionsInput, T extends object = object> {
  <H extends HeaderHandler<RouterCallContext<T>>, const RO extends object = PlainHeadersMiddlewareOptions>(
    handler: H,
    opts?: CompTimeArgs<RO & NoInfer<MiddlewareOptionsOf<T> & UnknownKeysGuard<RO, keyof MiddlewareOptionsOf<T>>>>,
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
export interface RawMiddlewareHelper<T extends object = object> {
  <H extends RawMiddlewareHandler<RouterCallContext<T>>, const RO extends object = RawMiddlewareOptions>(
    handler: H,
    opts?: RO & NoInfer<RawMiddlewareOptionsOf<T> & UnknownKeysGuard<RO, keyof RawMiddlewareOptionsOf<T>>>
  ): RawMiddlewareDef<H>;
}

export interface MionRouter<O extends RouterOptionsInput = RouterOptionsInput, T extends object = object> {
  /** The options given to the factory, frozen. */
  readonly options: Readonly<O>;
  readonly route: RouteHelper<O, T>;
  /** Read-only route: the client sends it as a GET when the payload fits in the url. */
  readonly query: RouteHelper<O, T, false>;
  /** Route that changes data: always sent as a POST. */
  readonly mutation: RouteHelper<O, T, true>;
  readonly middleware: MiddlewareHelper<O, T>;
  readonly headersMiddleware: HeadersMiddlewareHelper<O, T>;
  readonly rawMiddleware: RawMiddlewareHelper<T>;
  /** Once per app, and synchronous: the compiled type functions were injected at build time, so nothing loads here.
   *  `buildVersion` is filled by the build, never by hand: the server answers with it so a client can spot stale routes. */
  initRoutes<R extends Routes, const Version extends string = string>(
    routes: R,
    buildVersion?: InjectBuildVersion<PublicApi<R>> & Version
  ): PublicApi<R> & ApiBuildVersion<Version>;
}

/** What `createMionRouter.withTypes<T>()` returns: `createMionRouter` typed by the declared types. Overloads, not a
 *  defaulted `O`: a default cannot be proven to meet a constraint that reads `O` and `T`. */
export interface TypedRouterFactory<T extends RouterTypes> {
  (): MionRouter<Record<never, never>, T>;
  <const O extends RouterOptionsInput & RouterKeysOf<T> & KnownKeysOf<O, T>>(
    opts: RouterOptionsArg<O>
  ): MionRouter<O, WithShared<O, T>>;
}
