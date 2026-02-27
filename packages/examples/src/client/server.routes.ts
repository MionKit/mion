import {RpcError, HeadersSubset} from '@mionkit/core';
import {Routes, headersFn, middleFn, initMionRouter, route} from '@mionkit/router';
import {Logger} from 'Logger';

export type User = {id: string; name: string; surname: string};
export type Order = {id: string; date: Date; userId: string; totalUSD: number};

// Session info returned by auth middleFn - strongly typed in client onSuccess!
export type SessionInfo = {
    userId: string;
    role: 'admin' | 'user' | 'guest';
    permissions: string[];
    expiresAt: Date;
};

// Error data types - these will be strongly typed in the client!
export type UserNotFoundData = {requestedId: string; suggestedIds?: string[]};
export type OrderNotFoundData = {requestedId: string};
export type NotAuthorizedData = {reason: 'missing-token' | 'invalid-token' | 'expired-token'};

// Simulated database
const usersDb: Record<string, User> = {
    'USER-123': {id: 'USER-123', name: 'John', surname: 'Smith'},
};

const routes = {
    // MiddleFn with typed errorData and typed success return
    // When returnSession is true, returns SessionInfo - strongly typed in client onSuccess!
    auth: headersFn(
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
            // Return session info if requested
            if (returnSession) {
                return {
                    userId: 'USER-123',
                    role: 'admin',
                    permissions: ['read', 'write', 'delete'],
                    expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
                };
            }
        }
    ),
    users: {
        // Route with typed errorData - client can access error.errorData.requestedId
        getById: route((ctx, id: string): User | RpcError<'user-not-found', UserNotFoundData> => {
            const user = usersDb[id];
            if (!user) {
                return new RpcError({
                    publicMessage: `User ${id} not found`,
                    type: 'user-not-found',
                    errorData: {requestedId: id, suggestedIds: ['USER-123']},
                });
            }
            return user;
        }),
        delete: route((ctx, id: string): string => id),
        create: route((ctx, user: Omit<User, 'id'>): User => ({id: 'USER-123', ...user})),
        sayHello: route((ctx, user: User): string => `Hello ${user.name} ${user.surname}`),
    },
    orders: {
        // Route with typed errorData
        getById: route((ctx, id: string): Order | RpcError<'order-not-found', OrderNotFoundData> => {
            if (id === 'ORDER-404') {
                return new RpcError({
                    publicMessage: `Order ${id} not found`,
                    type: 'order-not-found',
                    errorData: {requestedId: id},
                });
            }
            return {id, date: new Date(), userId: 'USER-123', totalUSD: 120};
        }),
        delete: route((ctx, id: string): string => id),
        create: route((ctx, order: Omit<Order, 'id'>): Order => ({id: 'ORDER-123', ...order})),
    },
    utils: {
        sum: route((ctx, a: number, b: number): number => a + b),
    },
    log: middleFn((ctx): void => Logger.log(ctx.path, ctx.request.headers, ctx.request.body), {runOnError: true}),
} satisfies Routes;

// init & register routes (this automatically registers client routes)
const myApi = await initMionRouter(routes);

// Export the type of the Api (used by the client)
export type MyApi = typeof myApi;
