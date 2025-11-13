import {RpcError} from '@mionkit/core';
import {Routes, initMionRouter, headersHook, route, HeadersList} from '@mionkit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';

const authorizationHook = headersHook(
    async (context, [token, userId]: HeadersList<['Authorization', 'User-id']>): Promise<void> => {
        const me = await getAuthUser(token, userId);
        if (!isAuthorized(me)) {
            throw new RpcError({statusCode: 401, publicMessage: 'user is not authorized', type: 'not-authorized'});
        }
        context.shared.myUser = me; // user is added to ctx to shared with other routes/hooks
    }
);

const sayMyName = route((context): string => {
    return `hello ${context.shared.myUser.name}`;
});

const routes = {
    authorizationHook,
    sayMyName,
} satisfies Routes;

export const apiSpec = initMionRouter(routes);
