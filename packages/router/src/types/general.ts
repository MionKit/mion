/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CoreRouterOptions, SerializerMode} from '@mionjs/core';
import {ContextDataFactory} from './context.ts';
import {HeadersMiddleFnDef, MiddleFnDef, RawMiddleFnDef, RouteDef} from './definitions.ts';
// #######  Router Object #######

/** A route can be a full route definition or just the handler */
export type Route = RouteDef;

/** A route entry can be a route, a middleFn or sub-routes */
export type RouterEntry = Routes | MiddleFnDef | RouteDef | RawMiddleFnDef | HeadersMiddleFnDef;

/** Data structure to define all the routes, each entry is a route a middleFn or sub-routes */
export interface Routes {
  [key: string]: RouterEntry;
}

// ####### Router Options #######

/** Global Router Options */
export interface RouterOptions<Req = any, ContextData extends Record<string, any> = any> extends CoreRouterOptions {
  /** basePath for all routes, i.e: api/v1.
   * path separator is added between the prefix and the route */
  basePath: string;
  /** suffix for all routes, i.e: .json.
   * Not path separators is added between the route and the suffix */
  suffix: string;
  /** Transform the path before finding a route */
  pathTransform?: (request: Req, path: string) => string;
  /** factory function to initialize shared call context data */
  contextDataFactory?: ContextDataFactory<ContextData>;
  /**
   * Default serializer mode for response body serialization.
   * Can be overridden per-route using route options.
   * - 'json': Use prepareForJson, platform adapter handles JSON.stringify
   * - 'binary': Use toBinary JIT function for binary serialization
   * - 'stringifyJson': Use stringifyJson JIT function for optimized JSON serialization
   * @default 'stringifyJson'
   */
  serializer: SerializerMode;
  /** When true, isType and typeErrors reject objects with unknown/extra properties. Can be overridden per-route. */
  strictTypes?: boolean;
  /** When true, the rewrites the params types declare under a format's `transform` key (trim / case /
   *  replace / stripSeparators) are applied to the params after decode and before validation. Params
   *  only, never headers or return values. Default off. Can be overridden per-route. */
  sanitizeParams?: boolean;
  /** Used to return public data structure when adding routes */
  getPublicRoutesData: boolean;
  /** automatically generate and uuid */
  autoGenerateErrorId: boolean;
  /** client routes are initialized by default */
  skipClientRoutes: boolean;
  /**
   * Maximum size of the CallContext pool for reduced memory allocations.
   * When set to a value > 0, CallContext objects are reused from a pool
   * instead of creating new ones for each request. This can improve
   * performance in high-throughput scenarios by reducing GC pressure.
   * Set to 0 to disable pooling.
   * @default 0 (disabled)
   */
  maxContextPoolSize: number;
  /**
   * Largest request body the router accepts, in bytes (a string body is measured in characters).
   * Checked before the body is parsed, so it holds on every platform, including the ones whose
   * runtime has no limit of its own (cloudflare, aws, gcloud, vercel) and the `?data=` query body.
   * The node, uws and bun adapters also stop reading early with their own copy of the option.
   * A larger body is answered with a 413 `request-payload-too-large` error.
   * @default 256000
   */
  maxBodySize: number;
}
