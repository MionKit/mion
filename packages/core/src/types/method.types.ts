/* ###############
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ############### */

// ########################################## METHODS METADATA ##########################################

import {FnsDataCache, PureFnsDataCache, JitCompiledFunctions, ResolvedEncoder} from './general.types.ts';

/**
 * Shared interface for PublicMethod that can be used between client and server without handler dependencies
 * Serializable version of MethodMetadata in @/router/types/remoteMethods
 */
export interface MethodMetadata {
  /** Method type identifier */
  type: number;
  /** Unique identifier for the method (usually the full route path) */
  id: string;
  /** whether method is async or might return a promise.
   * If return type is not know method is considered async  */
  isAsync: boolean;
  /** true if method returns data (not void or undefined) */
  hasReturnData: boolean;
  /** Number of public method parameters (arity), derived from the params tuple runtype */
  paramsCount?: number;
  /** Parameter names from the params tuple's member labels (undefined per unlabelled member).
   *  Sourced from reflection, never from parsing handler.toString(), so they survive minification.
   *  Rides the client methods-metadata payload so a client can name the parameter that failed. */
  paramNames?: (string | undefined)[];
  /** JIT hash of the method parameters */
  paramsJitHash: string;
  /**  JIT  hash of the method return value */
  returnJitHash: string;
  /** Information about headers used by the method, used by HeadersFn */
  headersParam?: HeadersMetaData;
  /** Information about headers returned by the method, used by HeadersFn and when any other middleFn returns headers */
  headersReturn?: HeadersMetaData;
  /** Array of middleFn IDs associated with this method, only available for route methods */
  middleFnIds?: string[];
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
  /** The resolved encoder strategy per direction (route option, then router option, then the built-in
   *  default). Always resolved on an executable, and rides the methods metadata so the client picks the
   *  matching compiled functions. */
  encoder?: ResolvedEncoder;
  /** Whether this route mutates data. Only set for route handlers, undefined for middleFns. */
  isMutation?: boolean | undefined;
  /**
   * Per-route strictTypes override (resolved to the effective value: route option ?? router option),
   * so it also rides the methods metadata to the client. When true, objects carrying unknown/extra
   * properties are rejected via the compiled hasUnknownKeys/unknownKeyErrors fns — enforced on the
   * server at dispatch and, since R17, client-side in the local pre-validation lane.
   */
  strictTypes?: boolean;
  /**
   * Per-route sanitizeParams override (resolved to the effective value: route option ?? router option),
   * so it also rides the methods metadata to the client. When true, the rewrites the params types
   * declare under a format's `transform` key (trim / case / replace / stripSeparators) are applied to
   * the params after decode and BEFORE validation, on the server at dispatch and, when the client's own
   * `sanitizeParams` option is on, client-side before local pre-validation and serialization. Params
   * only: headers and return values are never sanitized. Runs even when `validateParams` is off.
   */
  sanitizeParams?: boolean;
  /**
   * Largest request body this route accepts, in bytes. On a route it is the RESOLVED limit of the
   * whole chain (route option, else the sum derived from every member's params types times the
   * router's `maxBodySizeFactor`, else the platform adapter's `maxBodySize`), what the adapters stop
   * the read at and the router checks before parsing. On a middleFn it is the member's own declared contribution
   * to that sum, for a middleFn whose params type has no maximum. Rides the methods metadata so a
   * client can refuse an oversize call before sending it.
   */
  maxBodySize?: number;
}

export interface RouteOnlyOptions extends RemoteMethodOpts {
  alwaysRun: false;
  encoder: ResolvedEncoder;
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
