// ####### Executables #######

import type {
  EncoderOption,
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
  methodCaller?: (...args: any[]) => any;
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

// The per-declaration encoder choice (`encoder` below) is a BUILD-TIME literal: the helper's marker
// families are derived from it in types, so it must be written inline or as an `as const` preset
// (the build reports a non-literal as CTA001 / CTA004). A string sets both directions, an object sets
// each; an unset direction falls back to the router-wide `encoder`, then to the built-in default.
// Flat interfaces on purpose (no Pick / Partial / intersections): a route declaration instantiates
// its options type on every call, and a mapped or intersected shape costs measurably more in the
// type-instantiation budget than a plain interface. Each helper has two overloads, one for options
// WITHOUT `encoder` (the router-wide default decides the families) and one WITH it, so every option
// type comes in those two flavours too; the public `RouteOptions` & co are the union of both.
interface RouteOptionsBase {
  description?: string;
  validateParams?: boolean;
  validateReturn?: boolean;
  /** Whether this route mutates data (query / mutation set it, route leaves it undefined). */
  isMutation?: boolean | undefined;
  strictTypes?: boolean;
  sanitizeParams?: boolean;
}
interface MiddleFnOptionsBase {
  description?: string;
  validateParams?: boolean;
  validateReturn?: boolean;
  alwaysRun?: boolean;
  strictTypes?: boolean;
  sanitizeParams?: boolean;
}
/** Retired: the wire choice is `encoder` (per direction, RunTypes strategy names). Typed `never` so
 *  the old key is a type error rather than a silently ignored option. */
interface RetiredOptions {
  serializer?: never;
}
// ####### Route options never inherit the router options #######
// These option types describe what a developer WRITES on one route, nothing else. They take no type
// parameter for the router options and MUST NOT gain one.
//
// Two reasons. First, the written value would stop type-checking: on a router set to
// `{params: 'clone'}` a route writing `{encoder: {params: 'compact'}}` would have to satisfy a merge
// that still demands `clone`. Second, and the reason it matters here, a parameterised
// `RouteOptions<RouterOpts>` is a fresh instantiation for every router, paid on EVERY route
// declaration, which is exactly the cost the type budget tracks.
//
// The inheritance happens in the two places that READ these options, never in the options
// themselves: the marker slot types take the route literal AND the factory literal side by side and
// fall back route, then router, then the built-in default (types/encoder.ts), and at runtime
// `resolveEncoder` does the same for the pair the executable carries (router.ts). So the option
// types stay one flat interface per kind, whatever any router is configured with.
export interface PlainRouteOptions extends RouteOptionsBase, RetiredOptions {
  encoder?: never;
}
export interface RouteOptionsWithEncoder extends RouteOptionsBase, RetiredOptions {
  encoder: EncoderOption;
}
export type RouteOptions = PlainRouteOptions | RouteOptionsWithEncoder;
export interface PlainMiddleFnOptions extends MiddleFnOptionsBase, RetiredOptions {
  encoder?: never;
}
export interface MiddleFnOptionsWithEncoder extends MiddleFnOptionsBase, RetiredOptions {
  encoder: EncoderOption;
}
export type MiddleFnOptions = PlainMiddleFnOptions | MiddleFnOptionsWithEncoder;
export type PlainHeadersMiddleFnOptions = PlainMiddleFnOptions;
export type HeadersMiddleFnOptionsWithEncoder = MiddleFnOptionsWithEncoder;
export type HeadersMiddleFnOptions = MiddleFnOptions;
// RawMiddleFnOptions doesn't need encoding - raw middleFns handle their own serialization
export type RawMiddleFnOptions = Partial<Pick<RawMethod['options'], 'description' | 'alwaysRun'>>;

export interface MethodsExecutionChain {
  routeIndex: number;
  methods: RemoteMethod[];
  /** Precalculated serializer code for the route's response body type */
  serializer: SerializerCode;
}
