import {RpcError} from '@mionkit/core';
import {Routes, headersHook, hook, initMionRouter, route} from '@mionkit/router';

const routes = {
    auth: headersHook('Authorization', (ctx, token: string): void => {
        if (!token) throw new RpcError({statusCode: 401, message: 'Not Authorized', name: ' Not Authorized'});
    }),
    utils: {
        sum5: route((ctx, a: number): number => a + 5),
        sayHello: route((ctx, message: string): string => `Hello ${message}`),
    },
    log: hook((ctx): void => console.log(ctx.path, ctx.request.headers, ctx.request.body), {
        forceRunOnError: true,
    }),
} satisfies Routes;

// init & register routes (this automatically registers client routes)
const myApi = initMionRouter(routes);

// Export the type of the Api (used by the client)
export type MyApi = typeof myApi;
