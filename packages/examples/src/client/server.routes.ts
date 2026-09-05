import {RpcError, HeadersSubset} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

export type User = {id: string; name: string; surname: string};
export type Order = {id: string; date: Date; userId: string; totalUSD: number};

// Session info returned by the auth middleware function - strongly typed in client onSuccess!
export type SessionInfo = {userId: string; role: 'admin' | 'user' | 'guest'};

// Error data types - these will be strongly typed in the client!
export type UserNotFoundData = {requestedId: string; suggestedIds?: string[]};
export type OrderNotFoundData = {requestedId: string};
export type NotAuthorizedData = {
  reason: 'missing-token' | 'invalid-token' | 'expired-token';
};

const usersDb: Record<string, User> = {
  'USER-123': {id: 'USER-123', name: 'John', surname: 'Smith'},
};

const routes = {
  // reads the Authorization header, returns a session when asked for one
  auth: mion.headersFn(
    (
      ctx,
      h: HeadersSubset<'Authorization'>,
      returnSession = false
    ): SessionInfo | void | RpcError<'not-authorized', NotAuthorizedData> => {
      const token = h.headers.Authorization;
      if (!token) {
        throw new RpcError({
          publicMessage: 'Not Authorized',
          type: 'not-authorized',
          errorData: {reason: 'missing-token'},
        });
      }
      if (returnSession) {
        return {userId: 'USER-123', role: 'admin'};
      }
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
