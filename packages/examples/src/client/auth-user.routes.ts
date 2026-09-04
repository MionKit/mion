import {HeadersSubset, RpcError} from '@mionjs/core';
import {Routes, headersFn, initMionRouter, route} from '@mionjs/router';

export type User = {id: string; name: string};
export type NotAuthorizedData = {reason: 'missing-token' | 'invalid-token'};
export type UserNotFoundData = {requestedId: string};

const routes = {
  // the declared error reaches the client strongly typed, errorData included
  auth: headersFn((ctx, h: HeadersSubset<'Authorization'>): void | RpcError<'not-authorized', NotAuthorizedData> => {
    if (!h.headers.Authorization) {
      throw new RpcError({
        publicMessage: 'Not Authorized',
        type: 'not-authorized',
        errorData: {reason: 'missing-token'},
      });
    }
  }),
  users: {
    getById: route((ctx, id: string): User | RpcError<'user-not-found', UserNotFoundData> => {
      if (id !== 'USER-123') {
        return new RpcError({
          publicMessage: `User ${id} not found`,
          type: 'user-not-found',
          errorData: {requestedId: id},
        });
      }
      return {id, name: 'John'};
    }),
  },
} satisfies Routes;

const myApi = await initMionRouter(routes);

export type AuthUserApi = typeof myApi;
