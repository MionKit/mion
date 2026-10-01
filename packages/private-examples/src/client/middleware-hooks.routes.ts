import {HeadersSubset, FatalError} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';
import type {CallContext} from '@mionjs/router';
import {getSession, type SessionInfo} from './session.ts';

const mion = createMionRouter();

export type TraceInfo = {traceId: string; receivedAt: Date};
export type NotAuthorizedData = {reason: 'no-session' | 'expired-session'};

// a plain handler, so a client installer can take its type
export function traceHandler(
  ctx: CallContext,
  {headers}: HeadersSubset<'X-Trace-Id'>
): TraceInfo {
  return {traceId: headers['X-Trace-Id'], receivedAt: new Date()};
}

// no params: it reads the HttpOnly session cookie the browser sends
export function authHandler(
  ctx: CallContext
): SessionInfo | FatalError<'not-authorized', NotAuthorizedData> {
  const session = getSession(ctx.request.headers.get('cookie'));
  // a returned FatalError ends the request (no route runs) and stays typed
  if (!session) {
    return new FatalError({
      publicMessage: 'Not Authorized',
      type: 'not-authorized',
      errorData: {reason: 'no-session'},
    });
  }
  return session;
}

const routes = {
  trace: mion.headersFn(traceHandler),
  auth: mion.middleware(authHandler),
  utils: {
    sum: mion.route((ctx, a: number, b: number): number => a + b),
  },
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
