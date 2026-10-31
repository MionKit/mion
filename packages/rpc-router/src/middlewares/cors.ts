/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {BUILD_VERSION_HEADER} from '@mionjs/core';
import {markAnswersPreflight, middleware} from '../lib/handlers.ts';
import {endChain} from '../lib/dispatchError.ts';
import {getMethodNames} from '../lib/httpMethods.ts';
import type {CallContext, MionHeaders} from '../types/context.ts';
import type {HeadersMethod, MethodsExecutionChain} from '../types/remoteMethods.ts';
import type {MionCorsOptions} from '../types/general.ts';

/** mion's own response headers the client reads */
const MION_EXPOSED_HEADERS = ['x-rpc-error', BUILD_VERSION_HEADER];

/** CORS for the routes it is placed before: at the root every route, in a group that group. Place it first, before
 *  any headers middleware: a preflight never carries the app's headers. `alwaysRun`, so an error answer is
 *  readable too. Every OPTIONS request ends here, so it never reaches a route. */
export function mionCors(options: MionCorsOptions) {
  // any origin echoed with cookies would let every site read answers sent with the user's cookies
  if (options.origin === '*' && options.credentials)
    throw new Error("mionCors: `credentials` needs the allowed origins listed, never '*'.");
  const isAllowed = getOriginCheck(options.origin);
  const credentials = !!options.credentials;
  const maxAge = options.maxAge === undefined ? undefined : String(options.maxAge);
  // built on a chain's first request: the lists come from what its members declare
  const chainHeaders = new WeakMap<MethodsExecutionChain, ReturnType<typeof buildChainHeaders>>();

  function cors(ctx: CallContext): void {
    const {request, response} = ctx;
    const isOptions = request.method === 'OPTIONS';
    // the answer depends on the origin, so a shared cache must key on it, allowed or not
    addVaryOrigin(response.headers);
    const origin = request.headers.get('origin');
    if (origin && isAllowed(origin)) {
      const headers = response.headers;
      let lists = chainHeaders.get(ctx.executionChain);
      if (!lists) chainHeaders.set(ctx.executionChain, (lists = buildChainHeaders(ctx.executionChain, options)));
      headers.set('access-control-allow-origin', origin);
      if (credentials) headers.set('access-control-allow-credentials', 'true');
      if (!isOptions) {
        if (lists.exposeHeaders) headers.set('access-control-expose-headers', lists.exposeHeaders);
      } else if (request.headers.has('access-control-request-method')) {
        headers.set('access-control-allow-methods', lists.allowMethods);
        headers.set('access-control-allow-headers', lists.allowHeaders);
        if (maxAge !== undefined) headers.set('access-control-max-age', maxAge);
      }
    }
    // a disallowed preflight ends too, with no CORS headers, so the browser blocks the call
    if (isOptions) endChain(ctx);
  }

  return markAnswersPreflight(middleware(cors, {alwaysRun: true}));
}

function getOriginCheck(origin: MionCorsOptions['origin']): (origin: string) => boolean {
  if (origin === '*') return () => true;
  if (typeof origin === 'string') return (requestOrigin) => requestOrigin === origin;
  if (Array.isArray(origin)) {
    const origins = new Set(origin);
    return (requestOrigin) => origins.has(requestOrigin);
  }
  // without `g` or `y`: a stateful pattern would answer differently on every call
  if (origin instanceof RegExp) {
    const pattern = new RegExp(origin.source, origin.flags.replace(/[gy]/g, ''));
    return (requestOrigin) => pattern.test(requestOrigin);
  }
  if (typeof origin === 'function') return origin;
  throw new Error('mionCors: `origin` must be a string, a list of strings, a RegExp or a function.');
}

/** The CORS header values of one chain, joined once */
function buildChainHeaders(chain: MethodsExecutionChain, options: MionCorsOptions) {
  const allowHeaders = new Set<string>(['content-type']);
  const exposeHeaders = new Set<string>(MION_EXPOSED_HEADERS);
  const allowExcluded = new Set<string>();
  const exposeExcluded = new Set<string>();
  for (const method of chain.methods) {
    const headersParam = (method as HeadersMethod).headersParam;
    if (headersParam) addNames(allowHeaders, allowExcluded, headersParam.headerNames, headersParam.corsExcluded);
    const headersReturn = method.headersReturn;
    if (headersReturn) addNames(exposeHeaders, exposeExcluded, headersReturn.headerNames, headersReturn.corsExcluded);
  }
  options.allowHeaders?.forEach((name) => allowHeaders.add(name.toLowerCase()));
  options.exposeHeaders?.forEach((name) => exposeHeaders.add(name.toLowerCase()));
  // last, after every merge, so nothing adds a `cors: false` name back
  allowExcluded.forEach((name) => allowHeaders.delete(name));
  exposeExcluded.forEach((name) => exposeHeaders.delete(name));
  return {
    allowHeaders: [...allowHeaders].join(', '),
    exposeHeaders: [...exposeHeaders].join(', '),
    allowMethods: getMethodNames(chain.methodBits)
      .filter((method) => method !== 'OPTIONS')
      .join(', '),
  };
}

function addNames(names: Set<string>, excluded: Set<string>, headerNames: string[], corsExcluded: string[] | undefined) {
  headerNames.forEach((name) => names.add(name.toLowerCase()));
  corsExcluded?.forEach((name) => excluded.add(name.toLowerCase()));
}

function addVaryOrigin(headers: MionHeaders): void {
  const vary = headers.get('vary');
  if (!vary) headers.set('vary', 'Origin');
  else if (!/(^|,)\s*origin\s*(,|$)/i.test(vary)) headers.set('vary', `${vary}, Origin`);
}
