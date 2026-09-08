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

// `encoder` is a BUILD-TIME literal: written inline or as an `as const` preset, or the build reports
// CTA001 / CTA004. An unset direction falls back to the router-wide value, then to the built-in default.
// Flat interfaces on purpose: a route declaration instantiates its options type on every call, and a
// mapped or intersected shape costs measurably more in the type-instantiation budget. Each option type
// comes in a `Plain` flavour (no `encoder`, the helper default) and a `WithEncoder` one; the public
// `RouteOptions` & co are the union of both.
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
/** Retired: the wire choice is `encoder`. Typed `never` so the old key is a type error, not ignored. */
interface RetiredOptions {
  serializer?: never;
}
// ####### Route options never inherit the router options #######
// These types describe what a developer WRITES on one route. They take no router-options type
// parameter and MUST NOT gain one: a route overriding `{params: 'compact'}` would stop type-checking
// against a router set to `clone`, and a parameterised `RouteOptions<RouterOpts>` would be a fresh
// instantiation paid on EVERY route declaration, the exact cost the type budget tracks.
// Inheritance lives in the two readers instead: the marker slot types (types/encoder.ts) and
// `resolveEncoder` at runtime (router.ts).
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
export type HeadersMiddleFnOptions = MiddleFnOptions;
// RawMiddleFnOptions doesn't need encoding - raw middleFns handle their own serialization
export type RawMiddleFnOptions = Partial<Pick<RawMethod['options'], 'description' | 'alwaysRun'>>;

export interface MethodsExecutionChain {
  routeIndex: number;
  methods: RemoteMethod[];
  /** Precalculated serializer code for the route's response body type */
  serializer: SerializerCode;
}
