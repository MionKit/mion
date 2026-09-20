/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CoreRouterOptions, SerializerOption} from '@mionjs/core';
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
  /** The router-wide serializer strategy: `clone`, `mutate` or `compact`. A string sets both
   *  directions, an object sets `params` and `return` separately. A BUILD-TIME literal, so a
   *  widened value is a type error; any route overrides either direction with its own `serializer`.
   *  @default {params: 'clone', return: 'clone'} */
  serializer?: SerializerOption;
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
   * Await every step of the execution chain, even one that returned a plain value.
   * The await is what makes the chain yield between steps, so a long chain never holds the event
   * loop. It is honoured only when the router HAS something async in it: when every registered
   * method is synchronous there is no promise to wait for, so the awaits are dropped either way.
   * Turning it off skips the await for handlers the build proved synchronous, which raises
   * throughput on chains of short sync steps and can cost tail latency under load. Measure both
   * before changing it.
   * @default true
   */
  alwaysAwait: boolean;
  /**
   * Multiplier applied to a request limit DERIVED from the types. The derived number is the largest
   * compact JSON a valid body can be, counted at the escaped worst case, so the factor only has to
   * cover whitespace and other formatting a client may add. Never applied to a route's own
   * `maxBodySize` option. A route whose types cannot say takes the platform adapter's `maxBodySize`.
   * @default 2
   */
  maxBodySizeFactor: number;
  /**
   * Drop the reference to the raw request body once it has been parsed. The parse is the only
   * thing that reads it, and holding it keeps the whole body alive for the rest of the request:
   * on a large body, times the requests in flight, that is the single biggest thing a server
   * holds. Turn it off when a middleFn that declares `alwaysRun` (an access log, an audit trail)
   * reads `ctx.request.rawBody` after the route has run; with it on, that reads an empty string.
   * @default true
   */
  releaseRawBody: boolean;
}
