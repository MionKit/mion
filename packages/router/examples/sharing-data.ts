import {RpcError} from '@mionkit/core';
import {Routes, initMionRouter, headersHook, route} from '@mionkit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';

const authorizationHook = headersHook('authorization', async (context, token: string): Promise<void> => {
    const me = await getAuthUser(token);
    if (!isAuthorized(me)) {
        throw new RpcError({statusCode: 401, publicMessage: 'user is not authorized'});
    }
    context.shared.myUser = me; // user is added to ctx to shared with other routes/hooks
});

const sayMyName = route((context): string => {
    return `hello ${context.shared.myUser.name}`;
});

const routes = {
    authorizationHook,
    sayMyName,
} satisfies Routes;

export const apiSpec = initMionRouter(routes);
