/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CoreRouterOptions, ParserOption} from '@mionjs/core';
import {ContextDataFactory} from './context.ts';
import {HeadersMiddleFnDef, MiddleFnDef, RawMiddleFnDef, RouteDef} from './definitions.ts';
// #######  Router Object #######

export type Route = RouteDef;

export type RouterEntry = Routes | MiddleFnDef | RouteDef | RawMiddleFnDef | HeadersMiddleFnDef;

/** Data structure to define all the routes */
export interface Routes {
  [key: string]: RouterEntry;
}

// ####### Router Options #######

/** Global Router Options */
export interface RouterOptions<Req = any, ContextData extends Record<string, any> = any> extends CoreRouterOptions {
  /** basePath for all routes, i.e: api/v1. A path separator is added after it */
  basePath: string;
  /** suffix for all routes, i.e: .json. No path separator is added before it */
  suffix: string;
  /** Transform the path before finding a route */
  pathTransform?: (request: Req, path: string) => string;
  /** factory function to initialize shared call context data */
  contextDataFactory?: ContextDataFactory<ContextData>;
  /** The router-wide parser strategy: a string sets both directions, an object `params` and `return`.
   *  A BUILD-TIME literal, so a widened value is a type error; a route's own `parser` overrides it.
   *  @default {params: 'clone', return: 'clone'} */
  parser?: ParserOption;
  /** Applies the rewrites the params types declare under a format's `transform` key, after decode and
   *  before validation. Params only, never headers or return values. Default off, overridable per-route. */
  sanitizeParams?: boolean;
  /** Used to return public data structure when adding routes */
  getPublicRoutesData: boolean;
  /** generate a uuid as the id of every error */
  autoGenerateErrorId: boolean;
  /** client routes are initialized by default */
  skipClientRoutes: boolean;
  /** Await every step of the chain, even one that returned a plain value: the await is what makes a long
   *  chain yield the event loop. Only honoured when the router has something async in it.
   *  Turning it off raises throughput on short sync chains and can cost tail latency under load.
   *  @default true */
  alwaysAwait: boolean;
  /** Multiplier applied to a request limit DERIVED from the types, covering whitespace and formatting a
   *  client may add (the derived number is the largest compact JSON a valid body can be, escaped worst case).
   *  Never applied to a route's own `maxBodySize`; a route whose types cannot say takes the adapter's.
   *  @default 2 */
  maxBodySizeFactor: number;
  /** Drop the raw request body once parsed: holding it keeps the whole body alive for the rest of the
   *  request, times the requests in flight. Turn it off when an `alwaysRun` middleFn (an access log)
   *  reads `ctx.request.rawBody` after the route ran; with it on, that reads an empty string.
   *  @default true */
  releaseRawBody: boolean;
  /** Headers added to every response, merged once when the router starts. The adapter's own
   *  `defaultResponseHeaders` wins on a clash.
   *  @default {} */
  globalResponseHeaders: Record<string, string>;
  /** Answer with the `x-build-version` header, the version of the API this server was built from, so a
   *  client with build-compiled routes can tell its own are stale. Off sends no header, which also turns
   *  the client's check off.
   *  @default true */
  apiVersionCheck: boolean;
}
