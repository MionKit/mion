import {RpcError, FatalError} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';
import {getSession, type SessionInfo} from './session.ts';

const mion = createMionRouter();

export type User = {id: string; name: string; surname: string};
export type Order = {id: string; date: Date; userId: string; totalUSD: number};

// returned by the auth middleware, strongly typed in the client onResponse hook
export type {SessionInfo};

// Error data types - these will be strongly typed in the client!
export type UserNotFoundData = {requestedId: string; suggestedIds?: string[]};
export type OrderNotFoundData = {requestedId: string};
export type NotAuthorizedData = {
  reason: 'no-session' | 'expired-session';
};

const usersDb: Record<string, User> = {
  'USER-123': {id: 'USER-123', name: 'John', surname: 'Smith'},
};

const routes = {
  // reads the HttpOnly session cookie the browser sends, JavaScript never sees it.
  // A returned FatalError ends the request (no route runs) and stays typed
  auth: mion.middleware(
    (ctx): SessionInfo | FatalError<'not-authorized', NotAuthorizedData> => {
      const session = getSession(ctx.request.headers.get('cookie'));
      if (!session || session.expiresAt < new Date()) {
        return new FatalError({
          publicMessage: 'Not Authorized',
          type: 'not-authorized',
          errorData: {reason: session ? 'expired-session' : 'no-session'},
        });
      }
      return session;
    }
  ),
  users: {
    // the returned error is part of the signature, so the client knows about it
    getById: mion.route(
      (
        ctx,
        id: string
      ): User | RpcError<'user-not-found', UserNotFoundData> => {
        const user = usersDb[id];
        if (!user) {
          return new RpcError({
            publicMessage: `User ${id} not found`,
            type: 'user-not-found',
            errorData: {requestedId: id, suggestedIds: ['USER-123']},
          });
        }
        return user;
      }
    ),
    sayHello: mion.route(
      (ctx, user: User): string => `Hello ${user.name} ${user.surname}`
    ),
  },
  orders: {
    getById: mion.route(
      (
        ctx,
        id: string
      ): Order | RpcError<'order-not-found', OrderNotFoundData> => {
        if (id === 'ORDER-404') {
          return new RpcError({
            publicMessage: `Order ${id} not found`,
            type: 'order-not-found',
            errorData: {requestedId: id},
          });
        }
        return {id, date: new Date(), userId: 'USER-123', totalUSD: 120};
      }
    ),
  },
  utils: {
    sum: mion.route((ctx, a: number, b: number): number => a + b),
  },
} satisfies Routes;

// init & register routes (this automatically registers client routes)
const myApi = mion.initRoutes(routes);

// Export the type of the Api (used by the client)
export type MyApi = typeof myApi;
