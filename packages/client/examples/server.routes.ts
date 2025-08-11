import {RpcError} from '@mionkit/core';
import {Routes, headersHook, hook, initMionRouter, route} from '@mionkit/router';
import {Logger} from 'Logger';

export type User = {id: string; name: string; surname: string};
export type Order = {id: string; date: Date; userId: string; totalUSD: number};

const routes = {
    auth: headersHook('authorization', (ctx, token: string): void => {
        if (!token) throw new RpcError({statusCode: 401, message: 'Not Authorized', name: ' Not Authorized'});
    }),
    users: {
        getById: route((ctx, id: string): User => ({id, name: 'John', surname: 'Smith'})),
        delete: route((ctx, id: string): string => id),
        create: route((ctx, user: Omit<User, 'id'>): User => ({id: 'USER-123', ...user})),
        sayHello: route((ctx, user: User): string => `Hello ${user.name} ${user.surname}`),
    },
    orders: {
        getById: route((ctx, id: string): Order => ({id, date: new Date(), userId: 'USER-123', totalUSD: 120})),
        delete: route((ctx, id: string): string => id),
        create: route((ctx, order: Omit<Order, 'id'>): Order => ({id: 'ORDER-123', ...order})),
    },
    utils: {
        sum: route((ctx, a: number, b: number): number => a + b),
    },
    log: hook((ctx): void => Logger.log(ctx.path, ctx.request.headers, ctx.request.body), {runOnError: true}),
} satisfies Routes;

// init & register routes (this automatically registers client routes)
const myApi = initMionRouter(routes);

// Export the type of the Api (used by the client)
export type MyApi = typeof myApi;
