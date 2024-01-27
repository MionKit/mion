import {RpcError} from '@mionkit/core';
import {RouterOptions, initMionRouter, headersHook, hook, route} from '@mionkit/router';

export type User = {id: string; name: string; surname: string};

// set options and init router
export const routerOptions: Partial<RouterOptions> = {prefix: 'api/v1'};
export const myApi = initMionRouter(
    // all function parameters will be automatically validated before the function is called
    {
        auth: headersHook('authorization', (ctx, token: string): void => {
            if (!token) throw new RpcError({statusCode: 401, message: 'Not Authorized'});
        }),
        users: {
            sayHello: route((ctx, user: User): string => `Hello ${user.name} ${user.surname}`),
        },
        log: hook((ctx): void => console.log(Date.now(), ctx.path, ctx.response.statusCode), {forceRunOnError: true}),
    },
    routerOptions
);

// Export the type of the Api (used by the client)
export type MyApi = typeof myApi;
