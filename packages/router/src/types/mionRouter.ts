/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CompTimeArgs, InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';
import type {
  EncoderLiteralGuard,
  ParamsDecode,
  ParamsEncode,
  ParamsFromBinary,
  ParamsToBinary,
  ReturnDecode,
  ReturnEncode,
  ReturnFromBinary,
  ReturnToBinary,
} from './encoder.ts';
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
// The options literal rides BY TYPE (`O`) into every helper, so the router-wide `encoder` reaches
// what the build compiles for a route. Marker rules and slot computation: see lib/handlers.ts,
// which carries the same spelled-out signatures and must be changed alongside this file.

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

/** `mion.route` / `mion.query` / `mion.mutation`: declares a route whose handler context is typed from the router options. */
export interface RouteHelper<O extends RouterOptionsInput> {
  <H extends Handler<RouterCallContext<O>>, const RO extends RouteOptions = PlainRouteOptions>(
    handler: H,
    opts?: CompTimeArgs<RO>,
    paramsFns?: InjectTypeFnArgs<
      HandlerParams<H>,
      'val',
      'verr',
      'huk',
      'uke',
      'fmt',
      ParamsEncode<RO, O>,
      ParamsDecode<RO, O>,
      ParamsToBinary<RO, O>,
      ParamsFromBinary<RO, O>
    >,
    returnFns?: InjectTypeFnArgs<
      HandlerReturn<H>,
      'val',
      'verr',
      'huk',
      'uke',
      ReturnEncode<RO, O>,
      ReturnDecode<RO, O>,
      ReturnToBinary<RO, O>,
      ReturnFromBinary<RO, O>
    >,
    paramsId?: InjectRunTypeId<HandlerParams<H>>,
    returnId?: InjectRunTypeId<HandlerReturn<H>>
  ): RouteDef<H>;
}

/** `mion.middleFn`: declares a middleFn whose handler context is typed from the router options. */
export interface MiddleFnHelper<O extends RouterOptionsInput> {
  <H extends Handler<RouterCallContext<O>>, const RO extends MiddleFnOptions = PlainMiddleFnOptions>(
    handler: H,
    opts?: CompTimeArgs<RO>,
    paramsFns?: InjectTypeFnArgs<
      HandlerParams<H>,
      'val',
      'verr',
      'huk',
      'uke',
      'fmt',
      ParamsEncode<RO, O>,
      ParamsDecode<RO, O>,
      ParamsToBinary<RO, O>,
      ParamsFromBinary<RO, O>
    >,
    returnFns?: InjectTypeFnArgs<
      HandlerReturn<H>,
      'val',
      'verr',
      'huk',
      'uke',
      ReturnEncode<RO, O>,
      ReturnDecode<RO, O>,
      ReturnToBinary<RO, O>,
      ReturnFromBinary<RO, O>
    >,
    paramsId?: InjectRunTypeId<HandlerParams<H>>,
    returnId?: InjectRunTypeId<HandlerReturn<H>>
  ): MiddleFnDef<H>;
}

/** `mion.headersFn`: declares a headers middleFn (2nd handler param a HeadersSubset) with the context typed from the router options. */
export interface HeadersFnHelper<O extends RouterOptionsInput> {
  <H extends HeaderHandler<RouterCallContext<O>>, const RO extends HeadersMiddleFnOptions = PlainHeadersMiddleFnOptions>(
    handler: H,
    opts?: CompTimeArgs<RO>,
    headersFns?: InjectTypeFnArgs<HeaderHandlerHeaders<H>, 'val', 'verr'>,
    paramsFns?: InjectTypeFnArgs<
      HeaderHandlerParams<H>,
      'val',
      'verr',
      'huk',
      'uke',
      'fmt',
      ParamsEncode<RO, O>,
      ParamsDecode<RO, O>,
      ParamsToBinary<RO, O>,
      ParamsFromBinary<RO, O>
    >,
    returnFns?: InjectTypeFnArgs<
      HandlerReturn<H>,
      'val',
      'verr',
      'huk',
      'uke',
      ReturnEncode<RO, O>,
      ReturnDecode<RO, O>,
      ReturnToBinary<RO, O>,
      ReturnFromBinary<RO, O>
    >,
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
  /** Initializes the router with the factory options and registers the routes. Once per app, and
   *  synchronous: the compiled type functions were injected at build time, so nothing is loaded here. */
  initRoutes<R extends Routes>(routes: R): PublicApi<R>;
}
// type-mion-router-end
