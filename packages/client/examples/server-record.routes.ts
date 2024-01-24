import {RpcError} from '@mionkit/core';
import {Routes, initMionRouter} from '@mionkit/router';

const routes = {
    auth: {
        hook: (ctx, token: string): void => {
            if (!token) throw new RpcError({statusCode: 401, message: 'Not Authorized', name: ' Not Authorized'});
        },
    },
    utils: {
        sum5: (ctx, a: number): number => a + 5,
        sayHello: (ctx, message: string): string => `Hello ${message}`,
    },
    log: {
        forceRunOnError: true,
        hook: (ctx): void => console.log(ctx.path, ctx.request.headers, ctx.request.body),
    },
} satisfies Routes;

// init & register routes (this automatically registers client routes)
const myApi = initMionRouter(routes);

// Export the type of the Api (used by the client)
export type MyApi = typeof myApi;
