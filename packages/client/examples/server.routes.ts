import {PublicError} from '@mionkit/core';
import {Routes, registerRoutes} from '@mionkit/router';
import {clientRoutes} from '@mionkit/common';
import {Logger} from 'Logger';

export type User = {name: string; surname: string};
const routes = {
    auth: {
        headerName: 'Authorization',
        canReturnData: true,
        headerHook: (ctx, token: string): User | PublicError => {
            if (token === 'myToken-XYZ') return {name: 'My', surname: 'user'};
            return new PublicError({statusCode: 401, message: 'Unauthorized', name: 'Unauthorized'});
        },
    },
    sayHello: {route: (ctx, user: User): string | PublicError => `Hello ${user.name} ${user.surname}`},
    alwaysFails: (ctx, user: User): User | PublicError =>
        new PublicError({statusCode: 500, message: 'Something fails', name: 'UnknownError'}),
    utils: {
        sumTwo: (ctx, a: number): number => a + 2,
    },
    log: {
        forceRunOnError: true,
        hook: (ctx): any => {
            Logger.log(ctx.path, ctx.request.headers, ctx.request.body);
        },
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
