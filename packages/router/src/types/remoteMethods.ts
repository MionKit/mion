// ####### Executables #######

import type {
  HeadersMethodWithJitFns,
  MethodWithJitFns,
  RemoteMethodOpts,
  RouteOnlyOptions,
  SerializerCode,
  SerializerOption,
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

// Interfaces, not intersections, on purpose: the type-budget suite prices each route declaration, and an intersection
// is re-resolved wherever it is read.
/** The `serializer` a route or middleFn can set: a strategy per direction (`params` is what the client sends, `return`
 *  what the server answers), or one strategy for both. It overrides the router default and is READ AT BUILD TIME, so
 *  it must be written inline or as an `as const` preset; the compiled families follow it. */
export interface SerializerOptions {
  serializer?: SerializerOption;
}
export interface RouteOptions
  extends
    Partial<
      Pick<
        RouteMethod['options'],
        'description' | 'validateParams' | 'validateReturn' | 'isMutation' | 'strictTypes' | 'sanitizeParams'
      >
    >,
    SerializerOptions {}
export interface MiddleFnOptions
  extends
    Partial<
      Pick<
        MiddleFnMethod['options'],
        'description' | 'validateParams' | 'validateReturn' | 'runOnError' | 'strictTypes' | 'sanitizeParams'
      >
    >,
    SerializerOptions {}
export interface HeadersMiddleFnOptions
  extends
    Partial<
      Pick<
        HeadersMethod['options'],
        'description' | 'validateParams' | 'validateReturn' | 'runOnError' | 'strictTypes' | 'sanitizeParams'
      >
    >,
    SerializerOptions {}
// RawMiddleFnOptions doesn't need encoding - raw middleFns handle their own serialization
export type RawMiddleFnOptions = Partial<Pick<RawMethod['options'], 'description' | 'runOnError'>>;

export interface MethodsExecutionChain {
  routeIndex: number;
  methods: RemoteMethod[];
  /** Precalculated serializer code for the route's response body type */
  serializer: SerializerCode;
}
