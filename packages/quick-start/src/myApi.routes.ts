import {RpcError} from '@mionkit/core';
import {Routes, RouterOptions, initMionRouter} from '@mionkit/router';

export type User = {id: string; name: string; surname: string};
export type Order = {id: string; date: Date; userId: string; totalUSD: number};

export const routes = {
    auth: {
        headerName: 'authorization',
        hook: (ctx, token: string): void => {
            if (!token) throw new RpcError({statusCode: 401, message: 'Not Authorized', name: ' Not Authorized'});
        },
    },
    users: {
        getById: (ctx, id: string): User => ({id, name: 'John', surname: 'Smith'}),
        delete: (ctx, id: string): string => id,
        create: (ctx, newUser: Omit<User, 'id'>): User => ({id: 'USER-123', ...newUser}),
    },
    orders: {
        getById: (ctx, id: string): Order => ({id, date: new Date(), userId: 'USER-123', totalUSD: 120}),
        delete: (ctx, id: string): string => id,
        create: (ctx, newOrder: Omit<Order, 'id'>): Order => ({id: 'ORDER-123', ...newOrder}),
    },
    log: {
        forceRunOnError: true,
        hook: (ctx): void => {
            console.log(Date.now(), ctx.path, ctx.response.statusCode);
        },
    },
} satisfies Routes;

// set options and init router
export const routerOptions: Partial<RouterOptions> = {prefix: 'api/v1'};
export const myApi = initMionRouter(routes, routerOptions);

// Export the type of the Api (used by the client)
export type MyApi = typeof myApi;
