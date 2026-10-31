/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {BUILD_VERSION_HEADER, FatalError, StatusCodes} from '@mionjs/core';
import {middleware} from '../lib/handlers.ts';
import {endChain} from '../lib/dispatchError.ts';
import type {CallContext} from '../types/context.ts';
import type {HeadersMethod, MethodsExecutionChain} from '../types/remoteMethods.ts';
import type {MionCorsSettings, MionSecurityOptions} from '../types/general.ts';

/** mion's own response headers the client reads */
const MION_EXPOSED_HEADERS = ['x-rpc-error', BUILD_VERSION_HEADER];
/** What a plain HTML form sends: a browser posts these to another site with no preflight */
const FORM_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'text/plain',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
]);
const QUERY_METHODS: readonly string[] = ['GET', 'HEAD', 'POST'];
const POST_ONLY: readonly string[] = ['POST'];

/** Place it first: a preflight carries none of the app's headers.
 *  `alwaysRun`, so an error answer still carries the CORS headers. */
export function mionSecurity(options: MionSecurityOptions = {}) {
  const {origins} = options;
  const cors = options.cors || undefined;
  // `!== false`, so a missing config value never turns a check off
  const csrfOptions = options.csrf;
  const csrf =
    csrfOptions === false
      ? undefined
      : {
          crossOrigin: csrfOptions?.crossOrigin !== false,
          methodByIntent: csrfOptions?.methodByIntent !== false,
          formContentTypes: csrfOptions?.formContentTypes !== false,
        };
  if (cors && origins === undefined) throw new Error('mionSecurity: `cors` needs the `origins` allowed to read answers.');
  // any origin echoed with cookies would let every site read the user's answers
  if (cors?.credentials && origins === '*')
    throw new Error("mionSecurity: `cors.credentials` needs the allowed origins listed, never '*'.");
  const maxAge = cors?.maxAge === undefined ? undefined : String(cors.maxAge);
  // built on a chain's first request, from what its members declare
  const chainRules = new WeakMap<MethodsExecutionChain, ReturnType<typeof describeChain>>();

  /** Asks only when the answer matters: always with CORS, else a cross-site request with no error yet.
   *  `null` is a sandboxed page's origin: never trusted. */
  function prepare(ctx: CallContext) {
    const {headers, method} = ctx.request;
    const origin = headers.get('origin');
    const sameOrigin =
      !csrf?.crossOrigin || method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || isPlainlySameOrigin(headers);
    const matters = !!cors || (!sameOrigin && !ctx.response.hasErrors);
    const ask = origin && origin !== 'null' && matters ? origin : undefined;
    return {origin, sameOrigin, ask};
  }

  function respond(ctx: CallContext, origin: string | null | undefined, trusted: boolean, sameOrigin: boolean) {
    const {request, response, executionChain} = ctx;
    const method = request.method;
    let rules = chainRules.get(executionChain);
    if (!rules) chainRules.set(executionChain, (rules = describeChain(executionChain, cors)));

    if (cors) {
      // the answer depends on the origin, so a shared cache must key on it, allowed or not
      const vary = response.headers.get('vary');
      if (!vary) response.headers.set('vary', 'Origin');
      else if (!/(^|,)\s*origin\s*(,|$)/i.test(vary)) response.headers.set('vary', `${vary}, Origin`);
      if (origin && trusted) {
        response.headers.set('access-control-allow-origin', origin);
        if (cors.credentials) response.headers.set('access-control-allow-credentials', 'true');
        if (method !== 'OPTIONS') {
          response.headers.set('access-control-expose-headers', rules.exposeHeaders);
        } else if (request.headers.has('access-control-request-method')) {
          response.headers.set('access-control-allow-methods', rules.allowMethods);
          response.headers.set('access-control-allow-headers', rules.allowHeaders);
          if (maxAge !== undefined) response.headers.set('access-control-max-age', maxAge);
        }
      }
    }
    // a preflight never reaches a route; a disallowed one gets no CORS headers, so the browser blocks the call
    if (method === 'OPTIONS') return endChain(ctx);
    if (!csrf || response.hasErrors) return;

    if (csrf.methodByIntent && rules.acceptedMethods && !rules.acceptedMethods.includes(method)) {
      const allowed = rules.acceptedMethods.join(', ');
      response.headers.set('allow', allowed);
      return new FatalError({
        statusCode: StatusCodes.METHOD_NOT_ALLOWED,
        type: 'method-not-allowed',
        publicMessage: `The route accepts only ${allowed}.`,
      });
    }
    if (method === 'GET' || method === 'HEAD') return;
    if (!sameOrigin && !trusted)
      return new FatalError({
        statusCode: StatusCodes.FORBIDDEN,
        type: 'cross-origin-request-refused',
        publicMessage: 'Cross-origin request refused.',
      });
    if (csrf.formContentTypes && method === 'POST' && isFormContentType(request.headers.get('content-type')))
      return new FatalError({
        statusCode: StatusCodes.UNSUPPORTED_MEDIA_TYPE,
        type: 'unsupported-media-type',
        publicMessage: 'Unsupported Media Type: send the body as application/json.',
      });
  }

  // only a lookup may be async: a list never pays for a promise
  if (typeof origins === 'function') {
    return middleware(
      async (ctx: CallContext): Promise<ReturnType<typeof respond>> => {
        const {origin, sameOrigin, ask} = prepare(ctx);
        const trusted = ask ? await origins(ctx, ask) : false;
        return respond(ctx, origin, trusted, sameOrigin);
      },
      {alwaysRun: true}
    );
  }
  const allowed = new Set(origins === '*' || origins === undefined ? [] : origins);
  return middleware(
    (ctx: CallContext): ReturnType<typeof respond> => {
      const {origin, sameOrigin, ask} = prepare(ctx);
      const trusted = !!ask && (origins === '*' || allowed.has(ask));
      return respond(ctx, origin, trusted, sameOrigin);
    },
    {alwaysRun: true}
  );
}

/** Mirrors Go 1.25 CrossOriginProtection; a caller sending neither header is no browser: no cookie to abuse */
function isPlainlySameOrigin(headers: CallContext['request']['headers']): boolean {
  const site = headers.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none';
  const origin = headers.get('origin');
  if (!origin) return true;
  if (origin === 'null') return false;
  try {
    return new URL(origin).host === headers.get('host');
  } catch {
    return false;
  }
}

function isFormContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return true;
  // what the mion client sends, without the parse below
  if (contentType.startsWith('application/json')) return false;
  const end = contentType.indexOf(';');
  return FORM_CONTENT_TYPES.has((end === -1 ? contentType : contentType.slice(0, end)).trim().toLowerCase());
}

/** What a chain needs per request: the methods its route's intent accepts, and its CORS header values */
function describeChain(chain: MethodsExecutionChain, cors: MionCorsSettings | undefined) {
  const route = chain.routeIndex === -1 ? undefined : chain.methods[chain.routeIndex];
  // a batch is one POST; a query reads, so it may come as GET; a mutation and an intent-less route only POST
  const acceptedMethods = !route ? undefined : !chain.batchId && route.options.isMutation === false ? QUERY_METHODS : POST_ONLY;
  if (!cors) return {acceptedMethods, allowHeaders: '', exposeHeaders: '', allowMethods: ''};
  const allowHeaders = new Set<string>(['content-type']);
  const exposeHeaders = new Set<string>(MION_EXPOSED_HEADERS);
  for (const member of chain.methods) {
    (member as HeadersMethod).headersParam?.headerNames.forEach((name) => allowHeaders.add(name.toLowerCase()));
    member.headersReturn?.headerNames.forEach((name) => exposeHeaders.add(name.toLowerCase()));
  }
  cors.allowHeaders?.forEach((name) => allowHeaders.add(name.toLowerCase()));
  cors.exposeHeaders?.forEach((name) => exposeHeaders.add(name.toLowerCase()));
  // last, so no other source adds an excluded name back
  cors.excludeHeaders?.forEach((name) => {
    allowHeaders.delete(name.toLowerCase());
    exposeHeaders.delete(name.toLowerCase());
  });
  return {
    acceptedMethods,
    allowHeaders: [...allowHeaders].join(', '),
    exposeHeaders: [...exposeHeaders].join(', '),
    allowMethods: acceptedMethods === QUERY_METHODS ? 'GET, POST' : 'POST',
  };
}
