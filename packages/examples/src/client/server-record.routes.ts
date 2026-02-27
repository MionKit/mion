import {HeadersSubset, RpcError} from '@mionkit/core';
import {Routes, headersFn, middleFn, initMionRouter, route} from '@mionkit/router';

const routes = {
    auth: headersFn((ctx, h: HeadersSubset<'Authorization'>): void => {
        const token = h.headers.Authorization;
        if (!token) throw new RpcError({publicMessage: 'Not Authorized', type: 'not-authorized'});
    }),
    utils: {
        sum5: route((ctx, a: number): number => a + 5),
        sayHello: route((ctx, message: string): string => `Hello ${message}`),
    },
    log: middleFn((ctx): void => console.log(ctx.path, ctx.request.headers, ctx.request.body), {
        runOnError: true,
    }),
} satisfies Routes;

// init & register routes (this automatically registers client routes)
const myApi = await initMionRouter(routes);

// Export the type of the Api (used by the client)
export type MyApi = typeof myApi;
