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
