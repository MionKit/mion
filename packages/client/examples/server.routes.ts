import {RpcError} from '@mionkit/core';
import {Routes, initMionRouter} from '@mionkit/router';
import {Logger} from 'Logger';
import {Cleaned, ClientHooks, ClientRoutes} from '../src/types';

export type User = {id: string; name: string; surname: string};
export type Order = {id: string; date: Date; userId: string; totalUSD: number};

const routes = {
    auth: {
        headerName: 'authorization',
        hook: (ctx, token: string): void => {
            if (!token) throw new RpcError({statusCode: 401, message: 'Not Authorized', name: ' Not Authorized'});
        },
    },
    users: {
        getById: (ctx, id: string): User => ({id, name: 'John', surname: 'Smith'}),
        delete: (ctx, id: string): string => id,
        create: (ctx, user: Omit<User, 'id'>): User => ({id: 'USER-123', ...user}),
    },
    orders: {
        getById: (ctx, id: string): Order => ({id, date: new Date(), userId: 'USER-123', totalUSD: 120}),
        delete: (ctx, id: string): string => id,
        create: (ctx, order: Omit<Order, 'id'>): Order => ({id: 'ORDER-123', ...order}),
    },
    utils: {
        sum: (ctx, a: number, b: number): number => a + b,
        sayHello: (ctx, user: User): string => `Hello ${user.name} ${user.surname}`,
    },
    log: {
        forceRunOnError: true,
        hook: (ctx): void => {
            Logger.log(ctx.path, ctx.request.headers, ctx.request.body);
        },
    },
} satisfies Routes;

// init & register routes (this automatically registers client routes)
const myApi = initMionRouter(routes);

// Export the type of the Api (used by the client)
export type MyApi = typeof myApi;
