import {RpcError} from '@mionkit/core';
import {Routes, registerRoutes} from '@mionkit/router';
import {clientRoutes} from '@mionkit/common';

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

// init server or serverless router
// initHttpRouter(...);
// initAwsLambdaRouter(...);

// register routes and exporting the type of the Api to be used by client
const myApi = registerRoutes(routes);
export type MyApi = typeof myApi;

// register routes required by client, (these routes serve metadata, for validation and serialization)
registerRoutes(clientRoutes);
