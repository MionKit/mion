import {RpcError, FatalError} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';
import {getSession} from './session.ts';

const mion = createMionRouter();

export type User = {id: string; name: string};
export type NotAuthorizedData = {reason: 'no-session' | 'expired-session'};
export type UserNotFoundData = {requestedId: string};

const routes = {
  // reads the HttpOnly session cookie; a returned FatalError ends the request and reaches the client typed
  auth: mion.middleware(
    (ctx): void | FatalError<'not-authorized', NotAuthorizedData> => {
      if (!getSession(ctx.request.headers.get('cookie'))) {
        return new FatalError({
          publicMessage: 'Not Authorized',
          type: 'not-authorized',
          errorData: {reason: 'no-session'},
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
