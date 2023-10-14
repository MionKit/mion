import {RpcError} from '@mionkit/core';
import {Routes, RouterOptions, initRouter, registerRoutes} from '@mionkit/router';
import {clientRoutes} from '@mionkit/client';
import {Logger} from 'Logger';

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
    utils: {
        sum: (ctx, a: number, b: number): number => a + b,
        sayHello: (ctx, user: User): string => `Hello ${user.name} ${user.surname}`,
    },
    log: {
        forceRunOnError: true,
        hook: (ctx): void => {
            Logger.log(ctx.path, ctx.response.statusCode);
            if (ctx.request.internalErrors.length) Logger.error(ctx.path, ctx.request.internalErrors);
        },
    },
} satisfies Routes;

// set options and init router
export const routerOptions: RouterOptions = {prefix: 'api/v1'};
initRouter(routerOptions);

// register routes and exporting the type of the Api (used by the client)
export const myApi = registerRoutes(routes);
export type MyApi = typeof myApi;

// register routes required by client
// these routes serve metadata required for validation and serialization on the client
registerRoutes(clientRoutes);
