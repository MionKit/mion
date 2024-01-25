import {RpcError} from '@mionkit/core';
import {RouterOptions, initMionRouter} from '@mionkit/router';

export type User = {id: string; name: string; surname: string};

// set options and init router
export const routerOptions: Partial<RouterOptions> = {prefix: 'api/v1'};
export const myApi = initMionRouter(
    {
        // all function parameters will be automatically validated before the function is called
        auth: {
            headerName: 'authorization',
            hook: (ctx, token: string): void => {
                if (!token) throw new RpcError({statusCode: 401, message: 'Not Authorized'});
            },
        },
        users: {
            sayHello: (ctx, user: User): string => `Hello ${user.name} ${user.surname}`,
        },
        log: {
            forceRunOnError: true,
            hook: (ctx): void => {
                console.log(Date.now(), ctx.path, ctx.response.statusCode);
            },
        },
    },
    routerOptions
);

// Export the type of the Api (used by the client)
export type MyApi = typeof myApi;
