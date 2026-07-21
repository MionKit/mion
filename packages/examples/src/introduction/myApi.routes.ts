import {HeadersSubset, RpcError} from '@mionjs/core';
import {RouterOptions, initMionRouter, headersFn, middleFn, route} from '@mionjs/router';

export type User = {id: string; name: string; surname: string};

// set options and init router
export const routerOptions: Partial<RouterOptions> = {basePath: 'api/v1'};
export const myApi = await initMionRouter(
    // all function parameters will be automatically validated before the function is called
    {
        auth: headersFn((ctx, h: HeadersSubset<'Authorization'>): void | RpcError<'not-authorized'> => {
            const token = h.headers.Authorization;
            if (!token) return new RpcError<'not-authorized'>({publicMessage: 'Not Authorized', type: 'not-authorized'});
        }),
        users: {
            sayHello: route((ctx, user: User): string => `Hello ${user.name} ${user.surname}`),
        },
        log: middleFn((ctx): void => console.log(Date.now(), ctx.path, ctx.response.statusCode), {runOnError: true}),
    },
    routerOptions
);

// Export the type of the Api (used by the client)
export type MyApi = typeof myApi;
