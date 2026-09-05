/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CompTimeArgs, InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';
import type {SerializerOption, WireStrategy} from '@mionjs/core';
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
// factory returns, so a router-wide setting can reach what the build compiles for a route: the
// `serializer` default below is the first such setting.
//
// `RO` carries the route option literal. Its default is its own constraint (so `typeof mion.route<H>` still works):
// a call without options leaves it there, and the constraint's optional `serializer` matches no strategy, so the
// router default applies. An object default (`Record<never, never>`) costs the checker more at every declaration
// (priced by packages/type-budget).
//
// ⚠️ The markers below must be spelled out (InjectTypeFnArgs<...> / InjectRunTypeId<...> /
// CompTimeArgs<...>) — the mion scanner reads the RESOLVED signature of each `mion.route(...)`
// call and matches the alias names syntactically; a local type alias over a marker is not
// recognized. The family slots of a marker are CONDITIONAL types computed from the route option
// literal (`RO`) and the factory option literal (`O`): the scanner reads each slot once it is
// resolved to a string literal, skips a slot that resolved to `never`, and the runtime reads the
// injected payload by family tag (see MION_FN_KEYS in @mionjs/core), never by position.

/** The options accepted by `createMionRouter`: every router option is optional. */
export type RouterOptionsInput = Partial<RouterOptions>;

/** No factory options in scope: the built-in strategies apply (the internal routes are declared this way). */
export type EmptyOptions = Record<never, never>;

/** The shared call-context data type the factory's `contextDataFactory` produces, `any` when there is none. */
export type ContextDataOf<O extends RouterOptionsInput> = O extends {contextDataFactory: ContextDataFactory<infer ContextData>}
  ? ContextData
  : any;

/** The CallContext every handler declared through `createMionRouter(opts)` receives: `ctx.shared` is typed from the options. */
export type RouterCallContext<O extends RouterOptionsInput> = CallContext<ContextDataOf<O>>;

// ####### Serializer strategies, resolved at the type level #######
// Params: the client encodes, the server decodes. Return: the server encodes, the client decodes.
// A direction resolves route option -> factory option -> built-in (`params: 'direct'`, `return: 'mutate'`),
// and each strategy names the families the marker slots below demand:
//   clone -> pjs + rj | mutate -> pj + rj | direct -> sj + rj | compact -> cj + cjr
//   binary -> tb + fb BESIDE the built-in json pair of the direction (sj + rj for params, pj + rj for return)

// One conditional per level, no helper aliases in between: every alias layer here is instantiated again at every
// route declaration, and the type-budget suite (packages/type-budget) prices this signature.
/** The params strategy the factory options `O` set, or the built-in `direct`. */
type RouterParamsStrategy<O> = O extends {serializer: infer S}
  ? S extends WireStrategy
    ? S
    : S extends {params: infer V extends WireStrategy}
      ? V
      : 'direct'
  : 'direct';
/** The return strategy the factory options `O` set, or the built-in `mutate`. */
type RouterReturnStrategy<O> = O extends {serializer: infer S}
  ? S extends WireStrategy
    ? S
    : S extends {return: infer V extends WireStrategy}
      ? V
      : 'mutate'
  : 'mutate';
/** The params strategy of a route declared with options `RO` on a router created with options `O`. */
export type ParamsStrategy<RO, O> = RO extends {serializer: infer S}
  ? S extends WireStrategy
    ? S
    : S extends {params: infer V extends WireStrategy}
      ? V
      : RouterParamsStrategy<O>
  : RouterParamsStrategy<O>;
/** The return strategy of a route declared with options `RO` on a router created with options `O`. */
export type ReturnStrategy<RO, O> = RO extends {serializer: infer S}
  ? S extends WireStrategy
    ? S
    : S extends {return: infer V extends WireStrategy}
      ? V
      : RouterReturnStrategy<O>
  : RouterReturnStrategy<O>;
type EncodeFamily<S, BuiltIn extends 'sj' | 'pj'> = S extends 'clone'
  ? 'pjs'
  : S extends 'mutate'
    ? 'pj'
    : S extends 'direct'
      ? 'sj'
      : S extends 'compact'
        ? 'cj'
        : S extends 'binary'
          ? BuiltIn
          : never;
type DecodeFamily<S> = S extends 'compact' ? 'cjr' : 'rj';
type ToBinaryFamily<S> = S extends 'binary' ? 'tb' : never;
type FromBinaryFamily<S> = S extends 'binary' ? 'fb' : never;

// The factory option must be ONE literal per direction: the build reads it off the type, so a widened value (a
// union, `string`, an env-driven pick) would compile nothing usable. The check intersects a message-carrying
// property type onto the argument, which is what the error then quotes.
// Written with `keyof` tests and indexed access on purpose: an `infer` or `Exclude` conditional at the root is paid
// on EVERY factory call, serializer or not (about a hundred instantiations, priced by packages/type-budget), while
// this shape prices the check only once a `serializer` is written.
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;
/** The type a widened option resolves to. An object, not a string literal, so the intersection with the written
 *  literal never collapses to `never`; named so the error reads as the instruction. */
type SerializerMustBeOneLiteralPerDirection = {
  'the serializer must be one literal per direction, written inline or as an `as const` preset: the build reads it': true;
};
/** `S` when it is one strategy literal, the message type otherwise. */
type OneStrategy<S> = [S] extends [WireStrategy]
  ? [IsUnion<S>] extends [false]
    ? S
    : SerializerMustBeOneLiteralPerDirection
  : SerializerMustBeOneLiteralPerDirection;
/** One direction of the object form: left out (or `undefined`) stays so, written it must be one literal. */
type OneDirection<V> = [V] extends [undefined] ? undefined : OneStrategy<V>;
type LiteralSerializer<S> = [SerializerOption | undefined] extends [S]
  ? S // the options type itself (an optional `serializer`), not a literal: nothing to check
  : [S] extends [undefined]
    ? undefined
    : [S] extends [WireStrategy]
      ? OneStrategy<S>
      : [S] extends [object]
        ? {
            params?: OneDirection<S[Extract<keyof S, 'params'>]>;
            return?: OneDirection<S[Extract<keyof S, 'return'>]>;
          }
        : SerializerMustBeOneLiteralPerDirection;
/** `unknown` when `O` has no `serializer`; otherwise `{serializer?: <its literal, or the message type>}`, intersected
 *  onto the factory argument so a widened option fails to type check with a message saying how to write it. */
export type SerializerIsLiteral<O extends RouterOptionsInput> = 'serializer' extends keyof O
  ? {serializer?: LiteralSerializer<O['serializer']>}
  : unknown;

/** `mion.route` / `mion.query` / `mion.mutation`: declares a route whose handler context is typed from the router
 *  options and whose compiled families follow its `serializer` option (a literal, or an `as const` preset). */
export interface RouteHelper<O extends RouterOptionsInput> {
  <H extends Handler<RouterCallContext<O>>, const RO extends RouteOptions = RouteOptions>(
    handler: H,
    opts?: CompTimeArgs<RO>,
    paramsFns?: InjectTypeFnArgs<
      HandlerParams<H>,
      'val',
      'verr',
      'huk',
      'uke',
      'fmt',
      EncodeFamily<ParamsStrategy<RO, O>, 'sj'>,
      DecodeFamily<ParamsStrategy<RO, O>>,
      ToBinaryFamily<ParamsStrategy<RO, O>>,
      FromBinaryFamily<ParamsStrategy<RO, O>>
    >,
    returnFns?: InjectTypeFnArgs<
      HandlerReturn<H>,
      'val',
      'verr',
      'huk',
      'uke',
      EncodeFamily<ReturnStrategy<RO, O>, 'pj'>,
      DecodeFamily<ReturnStrategy<RO, O>>,
      ToBinaryFamily<ReturnStrategy<RO, O>>,
      FromBinaryFamily<ReturnStrategy<RO, O>>
    >,
    paramsId?: InjectRunTypeId<HandlerParams<H>>,
    returnId?: InjectRunTypeId<HandlerReturn<H>>
  ): RouteDef<H>;
}

/** `mion.middleFn`: declares a middleFn whose handler context is typed from the router options; its params and
 *  return ride the same wires as a route's, so it takes the same `serializer` option. */
export interface MiddleFnHelper<O extends RouterOptionsInput> {
  <H extends Handler<RouterCallContext<O>>, const RO extends MiddleFnOptions = MiddleFnOptions>(
    handler: H,
    opts?: CompTimeArgs<RO>,
    paramsFns?: InjectTypeFnArgs<
      HandlerParams<H>,
      'val',
      'verr',
      'huk',
      'uke',
      'fmt',
      EncodeFamily<ParamsStrategy<RO, O>, 'sj'>,
      DecodeFamily<ParamsStrategy<RO, O>>,
      ToBinaryFamily<ParamsStrategy<RO, O>>,
      FromBinaryFamily<ParamsStrategy<RO, O>>
    >,
    returnFns?: InjectTypeFnArgs<
      HandlerReturn<H>,
      'val',
      'verr',
      'huk',
      'uke',
      EncodeFamily<ReturnStrategy<RO, O>, 'pj'>,
      DecodeFamily<ReturnStrategy<RO, O>>,
      ToBinaryFamily<ReturnStrategy<RO, O>>,
      FromBinaryFamily<ReturnStrategy<RO, O>>
    >,
    paramsId?: InjectRunTypeId<HandlerParams<H>>,
    returnId?: InjectRunTypeId<HandlerReturn<H>>
  ): MiddleFnDef<H>;
}

/** `mion.headersFn`: declares a headers middleFn (2nd handler param a HeadersSubset) with the context typed from the
 *  router options; the headers are validated only, the body params and the return follow the `serializer` option. */
export interface HeadersFnHelper<O extends RouterOptionsInput> {
  <H extends HeaderHandler<RouterCallContext<O>>, const RO extends HeadersMiddleFnOptions = HeadersMiddleFnOptions>(
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
      EncodeFamily<ParamsStrategy<RO, O>, 'sj'>,
      DecodeFamily<ParamsStrategy<RO, O>>,
      ToBinaryFamily<ParamsStrategy<RO, O>>,
      FromBinaryFamily<ParamsStrategy<RO, O>>
    >,
    returnFns?: InjectTypeFnArgs<
      HandlerReturn<H>,
      'val',
      'verr',
      'huk',
      'uke',
      EncodeFamily<ReturnStrategy<RO, O>, 'pj'>,
      DecodeFamily<ReturnStrategy<RO, O>>,
      ToBinaryFamily<ReturnStrategy<RO, O>>,
      FromBinaryFamily<ReturnStrategy<RO, O>>
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

/** The `serializer` option shape, re-exported next to the helpers that read it. */
export type {SerializerOption};
