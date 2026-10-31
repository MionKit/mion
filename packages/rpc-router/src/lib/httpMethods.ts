/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {FatalError, MION_ROUTES, StatusCodes, defaultHttpMethods} from '@mionjs/core';
import type {RouteHttpMethod} from '@mionjs/core';
import type {CallContext, ChainResponse} from '../types/context.ts';
import type {MethodsExecutionChain, RemoteMethod} from '../types/remoteMethods.ts';
import {recordUndeclaredError} from './dispatchError.ts';
import {answersPreflight} from './handlers.ts';

// One bit per method, so a chain keeps the methods it accepts as one number and a request costs one test.
// Null prototype: the method comes off the wire, so `constructor` must not read as a bit.
const METHOD_BITS: Readonly<Record<string, number>> = Object.assign(Object.create(null), {GET: 1, POST: 2, OPTIONS: 4, QUERY: 8});
const METHOD_NAMES = ['GET', 'POST', 'OPTIONS', 'QUERY'] as const;
/** Any method missing from METHOD_BITS: only a chain accepting every method has it */
const OTHER_METHOD_BIT = 16;
/** A not-found chain answers 404 whatever the method */
export const ANY_METHOD_BITS = ~0;
const ROUTE_HTTP_METHODS: ReadonlySet<string> = new Set<RouteHttpMethod>(['GET', 'POST', 'QUERY']);

/** The route's own option, else its helper's default; an empty list or an unknown name is a registration error. */
export function resolveHttpMethods(routeId: string, httpMethods: readonly RouteHttpMethod[] | undefined, isMutation?: boolean) {
  if (httpMethods === undefined) return defaultHttpMethods(isMutation);
  if (!Array.isArray(httpMethods) || httpMethods.length === 0 || httpMethods.some((method) => !ROUTE_HTTP_METHODS.has(method)))
    throw new Error(`Route '${routeId}': httpMethods must be a non-empty list of 'GET', 'POST' or 'QUERY'.`);
  return httpMethods;
}

/** A chain accepts its route's methods, plus OPTIONS when one member is mion's CORS middleware, which ends every OPTIONS. */
export function getChainMethodBits(httpMethods: readonly string[], members: readonly RemoteMethod[]): number {
  let bits = 0;
  for (const method of httpMethods) bits |= METHOD_BITS[method];
  if (members.some(answersPreflight)) bits |= METHOD_BITS.OPTIONS;
  return bits;
}

/** The method names a chain accepts, in a fixed order: the `Allow` and `Access-Control-Allow-Methods` values. */
export function getMethodNames(bits: number): string[] {
  return METHOD_NAMES.filter((method) => (bits & METHOD_BITS[method]) !== 0);
}

export function acceptsMethod(chain: MethodsExecutionChain, method: string): boolean {
  return (chain.methodBits & (METHOD_BITS[method] ?? OTHER_METHOD_BIT)) !== 0;
}

/** Recorded like a platform error: a 405 with an `Allow` header, and the `alwaysRun` members still run. A request
 *  that already failed (the adapter refused its body) keeps that error. */
export function refuseMethod(context: CallContext): void {
  if ((context.response as ChainResponse).stopped) return;
  const allowed = getMethodNames(context.executionChain.methodBits);
  context.response.headers.set('allow', allowed.join(', '));
  const refusal = new FatalError({
    statusCode: StatusCodes.METHOD_NOT_ALLOWED,
    type: 'method-not-allowed',
    publicMessage: 'The route does not accept this HTTP method.',
    errorData: {allowed},
  });
  recordUndeclaredError(context, MION_ROUTES.platformError, refusal);
}
