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

/** The per-declaration encoder choice. A BUILD-TIME literal: the helper's marker families are derived
 *  from it in types, so it must be written inline or as an `as const` preset (the build reports a
 *  non-literal as CTA001 / CTA004). A string sets both directions, an object sets each; an unset
 *  direction falls back to the router-wide `encoder`, then to the built-in default. */
export interface EncoderOptions {
  encoder?: EncoderOption;
  /** Retired: the wire choice is `encoder` (per direction, RunTypes strategy names). Typed `never` so
   *  the old key is a type error rather than a silently ignored option. */
  serializer?: never;
}
export type RouteOptions = Partial<
  Pick<
    RouteMethod['options'],
    'description' | 'validateParams' | 'validateReturn' | 'isMutation' | 'strictTypes' | 'sanitizeParams'
  >
> &
  EncoderOptions;
export type MiddleFnOptions = Partial<
  Pick<
    MiddleFnMethod['options'],
    'description' | 'validateParams' | 'validateReturn' | 'alwaysRun' | 'strictTypes' | 'sanitizeParams'
  >
> &
  EncoderOptions;
export type HeadersMiddleFnOptions = Partial<
  Pick<
    HeadersMethod['options'],
    'description' | 'validateParams' | 'validateReturn' | 'alwaysRun' | 'strictTypes' | 'sanitizeParams'
  >
> &
  EncoderOptions;
// RawMiddleFnOptions doesn't need encoding - raw middleFns handle their own serialization
export type RawMiddleFnOptions = Partial<Pick<RawMethod['options'], 'description' | 'alwaysRun'>>;

export interface MethodsExecutionChain {
  routeIndex: number;
  methods: RemoteMethod[];
  /** Precalculated serializer code for the route's response body type */
  serializer: SerializerCode;
}
