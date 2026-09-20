// ####### Executables #######

import type {
  SerializerOption,
  HeadersMethodWithJitFns,
  MethodWithJitFns,
  RemoteMethodOpts,
  RouteOnlyOptions,
  SerializerCode,
} from '@mionjs/core'; // do not import type only
import type {AnyHandler, Handler, HeaderHandler, RawMiddleFnHandler} from './handlers.ts'; // do not import type only
import {HandlerType} from '@mionjs/core'; // do not import type only

/** Contains the handlers for middleFns and routes */
export interface RemoteMethod<H extends AnyHandler = AnyHandler> extends MethodWithJitFns {
  /** router options */
  options: RemoteMethodOpts;
  handler: H;
  /** The caller for this method's kind, resolved when the method is registered. Flat on purpose:
   *  the dispatch loop runs for every chain member of every request. */
  methodCaller: (...args: any[]) => any;
  /** `options.alwaysRun`, flattened for the same reason: the loop reads it once per member. */
  alwaysRun: boolean;
  /** `JSON.stringify(id)`, the method's own key as it is written into the response body. Constant
   *  per method, and the JSON serializer wrote it out again for every member of every request. */
  quotedId: string;
  /** Set the first time a method marked synchronous actually runs, once its returned value has been
   *  checked for being a promise. See the guard in `runExecutionChain`. */
  asyncChecked?: boolean;
}

export interface RouteMethod<H extends Handler = any> extends RemoteMethod<H> {
  type: typeof HandlerType.route;
  options: RouteOnlyOptions;
}
export interface MiddleFnMethod<H extends Handler = any> extends RemoteMethod<H> {
  type: typeof HandlerType.middleFn;
}
export interface HeadersMethod<H extends HeaderHandler = any> extends RemoteMethod<H> {
  type: typeof HandlerType.headersMiddleFn;
  headersParam: HeadersMethodWithJitFns;
}
export interface RawMethod<H extends RawMiddleFnHandler = any> extends RemoteMethod<H> {
  type: typeof HandlerType.rawMiddleFn;
  options: RemoteMethodOpts & {
    validateParams: false;
    validateReturn?: false;
  };
}

// `serializer` is a BUILD-TIME literal: written inline or as an `as const` preset, or the build reports
// CTA001 / CTA004. An unset direction falls back to the router-wide value, then to the built-in default.
// Flat interfaces on purpose: a route declaration instantiates its options type on every call, and a
// mapped or intersected shape costs measurably more in the type-instantiation budget. Each option type
// comes in a `Plain` flavour (no `serializer`, the helper default) and a `WithSerializer` one; the public
// `RouteOptions` & co are the union of both.
interface RouteOptionsBase {
  description?: string;
  validateParams?: boolean;
  validateReturn?: boolean;
  /** Whether this route mutates data (query / mutation set it, route leaves it undefined). */
  isMutation?: boolean | undefined;
  strictTypes?: boolean;
  sanitizeParams?: boolean;
  /** Largest request body this route accepts, in bytes. Wins over the number derived from the
   *  types and over the router option. */
  maxBodySize?: number;
}
interface MiddleFnOptionsBase {
  description?: string;
  validateParams?: boolean;
  /** This middleFn's contribution to the request limit of every chain it sits in, in bytes, for a
   *  middleFn whose params type has no maximum (a plain `string[]`). Without it such a middleFn
   *  sends every chain it sits in to the router default. */
  maxBodySize?: number;
  validateReturn?: boolean;
  alwaysRun?: boolean;
  strictTypes?: boolean;
  sanitizeParams?: boolean;
}
// ####### Route options never inherit the router options #######
// These types describe what a developer WRITES on one route. They take no router-options type
// parameter and MUST NOT gain one: a route overriding `{params: 'compact'}` would stop type-checking
// against a router set to `clone`, and a parameterised `RouteOptions<RouterOpts>` would be a fresh
// instantiation paid on EVERY route declaration, the exact cost the type budget tracks.
// Inheritance lives in the two readers instead: the marker slot types (types/serializer.ts) and
// `resolveSerializer` at runtime (router.ts).
export interface PlainRouteOptions extends RouteOptionsBase {
  serializer?: never;
}
export interface RouteOptionsWithSerializer extends RouteOptionsBase {
  serializer: SerializerOption;
}
export type RouteOptions = PlainRouteOptions | RouteOptionsWithSerializer;
export interface PlainMiddleFnOptions extends MiddleFnOptionsBase {
  serializer?: never;
}
export interface MiddleFnOptionsWithSerializer extends MiddleFnOptionsBase {
  serializer: SerializerOption;
}
export type MiddleFnOptions = PlainMiddleFnOptions | MiddleFnOptionsWithSerializer;
export type PlainHeadersMiddleFnOptions = PlainMiddleFnOptions;
export type HeadersMiddleFnOptions = MiddleFnOptions;
// RawMiddleFnOptions doesn't need encoding - raw middleFns handle their own serialization
export type RawMiddleFnOptions = Partial<Pick<RawMethod['options'], 'description' | 'alwaysRun'>>;

export interface MethodsExecutionChain {
  /** Where the route sits in `methods`. -1 on mion's own not-found chains, which answer without a
   *  route, so anything reading `methods[routeIndex]` must exclude them (both readers do today: the
   *  maxBodySize cap walks the flat router, which never holds one, and the body parser returns early
   *  on `readsBody`). */
  routeIndex: number;
  methods: RemoteMethod[];
  /** Precalculated serializer code for the route's response body type */
  serializer: SerializerCode;
  /** The path this chain is registered at, which IS the transformed path a request resolves to:
   *  the lookup is a Map hit on that exact string. Undefined on the two kinds that answer for many
   *  paths, mion's not-found chains and a merged batch chain (cached per member-path list, so one
   *  object serves every endpoint path that reaches it); those take the request's own path. */
  path?: string;
  /** Id of the batch this chain runs, and its route ids in call order. Constant per merged chain,
   *  so they ride here rather than being copied per request. */
  batchId?: string;
  batchRouteIds?: string[];
  /** What the route option or the members' params types settled, in bytes. Undefined when the
   *  types could not say. Registration detail, read only by the platform cap: a request reads
   *  `maxBodySize`. */
  declaredBodySize?: number;
  /** The number a request is actually read against: `declaredBodySize`, else the platform
   *  adapter's. Folded here rather than resolved per request, and refreshed whenever either input
   *  moves, so resolving a request reads one field and allocates nothing to carry it. */
  maxBodySize: number;
  /** False only for mion's own not-found chains (an unknown path, an unknown batch id): the request
   *  has no route to feed, so the adapter never reads its body and the router never parses it. */
  readsBody: boolean;
}
