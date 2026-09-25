import {HeadersSubset, FatalError} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';
import type {CallContext} from '@mionjs/router';

const mion = createMionRouter();

// returned on success, strongly typed in the client onResponse hook
export type SessionInfo = {userId: string; role: 'admin' | 'user'};
export type NotAuthorizedData = {reason: 'missing-token' | 'invalid-token'};

// a plain handler, so a client installer can take its type (client-middleware-installer.ts)
export function authHandler(
  ctx: CallContext,
  h: HeadersSubset<'Authorization'>
): SessionInfo | FatalError<'not-authorized', NotAuthorizedData> {
  // a returned FatalError ends the request (no route runs) and stays typed
  if (!h.headers.Authorization) {
    return new FatalError({
      publicMessage: 'Not Authorized',
      type: 'not-authorized',
      errorData: {reason: 'missing-token'},
    });
  }
  return {userId: 'USER-123', role: 'admin'};
}

const routes = {
  auth: mion.headersFn(authHandler),
  utils: {
    sum: mion.route((ctx, a: number, b: number): number => a + b),
  },
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
