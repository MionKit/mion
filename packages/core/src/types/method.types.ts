/* ###############
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ############### */

// ########################################## METHODS METADATA ##########################################

import {FnsDataCache, PureFnsDataCache, JitCompiledFunctions, ResolvedParser} from './general.types.ts';
import type {FatalError} from '../errors.ts';

/** Shared between client and server, with no dependency on the handler itself. */
export interface MethodMetadata {
  /** Method type identifier */
  type: number;
  /** Unique identifier for the method (usually the full route path) */
  id: string;
  /** whether method is async or might return a promise; an unknown return type counts as async */
  isAsync: boolean;
  /** true if method returns data (not void or undefined) */
  hasReturnData: boolean;
  /** Number of public method parameters (arity), derived from the params tuple runtype */
  paramsCount?: number;
  /** Parameter names from the params tuple's member labels, '' for an unlabelled member. Sourced from
   *  reflection, never from parsing handler.toString(), so they survive minification. Rides the client
   *  methods-metadata payload so a client can name the parameter that failed. */
  paramNames?: string[];
  /** JIT hash of the method parameters */
  paramsJitHash: string;
  /**  JIT  hash of the method return value */
  returnJitHash: string;
  /** Information about headers used by the method, used by HeadersFn */
  headersParam?: HeadersMetaData;
  /** Information about headers returned by the method, used by HeadersFn and when any other middleware returns headers */
  headersReturn?: HeadersMetaData;
  /** Type id of the handler's `[params, return]` pair; a synced call sends the route's */
  syncId?: string;
  /** Array of middleware IDs associated with this method, only available for route methods */
  middlewareIds?: string[];
  /** router pointer ie ['users', 'getUser' ]  */
  pointer: string[];
  /** router nest level */
  nestLevel: number;
}

export interface RemoteMethodOpts {
  alwaysRun?: boolean;
  validateParams?: boolean;
  validateReturn?: boolean;
  description?: string;
  /** The resolved parser strategy per direction (route option, then router option, then the built-in
   *  default). Always resolved on an executable, and rides the methods metadata so the client picks the
   *  matching compiled functions. */
  parser?: ResolvedParser;
  /** Whether this route mutates data. Only set for route handlers, undefined for middlewares. */
  isMutation?: boolean | undefined;
  /** Per-route sanitizeParams, already resolved (route option ?? router option), so it also rides the methods
   *  metadata to the client. When true, the rewrites the params types declare under a format's `transform` key
   *  are applied after decode and BEFORE validation, on the server at dispatch and, when the client's own
   *  `sanitizeParams` is on, before its local pre-validation and serialization. Params only: headers and return
   *  values are never sanitized. Runs even when `validateParams` is off. */
  sanitizeParams?: boolean;
  /** Largest request body this route accepts, in bytes. On a route the RESOLVED limit of the whole chain
   *  (route option, else every member's params types summed times the router's `maxBodySizeFactor`, else the
   *  adapter's `maxBodySize`): where adapters stop the read and the router checks before parsing. On a middleware
   *  whose params type has no maximum, its own declared contribution to that sum. Rides the methods metadata so
   *  a client can refuse an oversize call before sending it. */
  maxBodySize?: number;
}

export interface RouteOnlyOptions extends RemoteMethodOpts {
  alwaysRun: false;
  parser: ResolvedParser;
}
export interface MethodWithOptions extends MethodMetadata {
  options: RemoteMethodOpts;
}

export type MethodsCache = Record<string, MethodWithOptions>;

export interface HeadersMetaData {
  headerNames: string[];
  jitHash: string;
}

export interface SerializableMethodsData {
  methods: MethodsCache;
  deps: FnsDataCache;
  purFnDeps: PureFnsDataCache;
  /** Ids of the batches the server has registered, listed when all methods are requested */
  batches?: string[];
}

/** One type for both mion@syncRoutes refusals: the encoder cannot tell two `FatalError`s in a union apart */
export type RouteSyncError = FatalError<'route-types-mismatch' | 'route-sync-required', RouteSyncErrorData>;

export interface RouteSyncErrorData {
  /** 'route-types-mismatch': the routes whose ids differ */
  routeIds?: string[];
  /** 'route-sync-required': the rows of the called routes and their chains, so the client can compute the ids */
  metadata?: SerializableMethodsData;
}

export interface HeadersMethodWithJitFns extends HeadersMetaData {
  jitFns: Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>;
}

export interface MethodWithJitFns extends MethodMetadata {
  paramsJitFns: JitCompiledFunctions;
  returnJitFns: JitCompiledFunctions;
  /** Largest compact-JSON size of a valid params tuple, from the build (`jsonMaxBytes` on the
   *  params reflection root); undefined when any param type has no maximum. */
  paramsJsonMaxBytes?: number;
  headersParam?: HeadersMethodWithJitFns;
  headersReturn?: HeadersMethodWithJitFns;
}

export type MethodWithOptsAndJitFns = MethodWithOptions & MethodWithJitFns;
