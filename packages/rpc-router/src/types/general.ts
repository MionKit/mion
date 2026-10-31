/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CoreRouterOptions, ParserOption} from '@mionjs/core';
import {CallContext, ContextDataFactory} from './context.ts';
import {HeadersMiddlewareDef, MiddlewareDef, RawMiddlewareDef, RouteDef} from './definitions.ts';
// #######  Router Object #######

export type Route = RouteDef;

export type RouterEntry = Routes | MiddlewareDef | RouteDef | RawMiddlewareDef | HeadersMiddlewareDef;

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
  /** Awaiting even sync steps is what makes a long chain yield the event loop. Off: an all-sync route answers
   *  without a promise, more throughput on short chains, maybe worse tail latency under load.
   *  @default true */
  alwaysAwait: boolean;
  /** Multiplier applied to a request limit DERIVED from the types, covering whitespace and formatting a
   *  client may add (the derived number is the largest compact JSON a valid body can be, escaped worst case).
   *  Never applied to a route's own `maxBodySize`; a route whose types cannot say takes the adapter's.
   *  @default 2 */
  maxBodySizeFactor: number;
  /** Drop the raw request body once parsed: holding it keeps the whole body alive for the rest of the
   *  request, times the requests in flight. Turn it off when an `alwaysRun` middleware (an access log)
   *  reads `ctx.request.rawBody` after the route ran; with it on, that reads an empty string.
   *  @default true */
  releaseRawBody: boolean;
  /** Headers added to every response, on every adapter. They replace `server: mionjs`, never `content-type`.
   *  @default {} */
  responseHeaders: Record<string, string>;
  /** Lets `mionFetchMetadata` send `x-build-version`, the API version this server was built from, so a client
   *  with build-compiled routes can tell its own are stale. Off also turns the client's check off.
   *  @default true */
  apiVersionCheck: boolean;
  /** Most methods `mionFetchMetadata` lists when a client asks for all; past it, only the ids sent.
   *  @default 100 */
  getAllRemoteMethodsMaxNumber: number;
}

/** The request handler a platform adapter hands to a dev host that owns the socket: node-style or fetch-style. */
export interface HostRequestHandler {
  node?(req: unknown, res: unknown): void;
  fetch?(req: Request): Response | Promise<Response>;
}

/** Options of `mionSecurity` */
export interface MionSecurityOptions {
  /** Trusted to send state-changing requests and, with `cors`, to read answers; a lookup runs only when it matters */
  origins?: readonly string[] | '*' | ((ctx: CallContext, origin: string) => boolean | Promise<boolean>);
  /** Lets the trusted origins read answers; off by default */
  cors?: false | MionCorsSettings;
  /** Cross-site request forgery checks, each on by default */
  csrf?: false | MionCsrfSettings;
}

export interface MionCorsSettings {
  /** Lets the browser send cookies; the caller's origin is echoed, and `origins: '*'` is refused */
  credentials?: boolean;
  /** Seconds the browser caches a preflight answer */
  maxAge?: number;
  /** Request headers a raw middleware reads, added to the ones the routes declare */
  allowHeaders?: string[];
  /** Response headers a raw middleware sets, added to the ones the routes declare */
  exposeHeaders?: string[];
  /** Headers kept off both lists, whoever declares them; still sent, so never a way to hide a secret */
  excludeHeaders?: string[];
}

export interface MionCsrfSettings {
  /** Refuses a request another site sent, unless its origin is trusted */
  crossOrigin?: boolean;
  /** A mutation, an intent-less route and a batch accept only POST; a query GET, HEAD and POST */
  methodByIntent?: boolean;
  /** Refuses a POST with a form content type or none */
  formContentTypes?: boolean;
}
