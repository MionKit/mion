import {HeadersSubset, RpcError} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

// returned on success, strongly typed in the client onSuccess handler
export type SessionInfo = {userId: string; role: 'admin' | 'user'};
export type NotAuthorizedData = {reason: 'missing-token' | 'invalid-token'};

const routes = {
  auth: mion.headersFn(
    (
      ctx,
      h: HeadersSubset<'Authorization'>
    ): SessionInfo | RpcError<'not-authorized', NotAuthorizedData> => {
      if (!h.headers.Authorization) {
        throw new RpcError({
          publicMessage: 'Not Authorized',
          type: 'not-authorized',
          errorData: {reason: 'missing-token'},
        });
      }
      return {userId: 'USER-123', role: 'admin'};
    }
  ),
  utils: {
    sum: mion.route((ctx, a: number, b: number): number => a + b),
  },
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
