import {HeadersSubset, RpcError, FatalError} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

export type User = {id: string; name: string};
export type NotAuthorizedData = {reason: 'missing-token' | 'invalid-token'};
export type UserNotFoundData = {requestedId: string};

const routes = {
  // a returned FatalError ends the request, and being declared it reaches the
  // client strongly typed, errorData included
  auth: mion.headersFn(
    (
      ctx,
      h: HeadersSubset<'Authorization'>
    ): void | FatalError<'not-authorized', NotAuthorizedData> => {
      if (!h.headers.Authorization) {
        return new FatalError({
          publicMessage: 'Not Authorized',
          type: 'not-authorized',
          errorData: {reason: 'missing-token'},
        });
      }
    }
  ),
  users: {
    getById: mion.route(
      (
        ctx,
        id: string
      ): User | RpcError<'user-not-found', UserNotFoundData> => {
        if (id !== 'USER-123') {
          return new RpcError({
            publicMessage: `User ${id} not found`,
            type: 'user-not-found',
            errorData: {requestedId: id},
          });
        }
        return {id, name: 'John'};
      }
    ),
  },
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
