import {RpcError, HeadersSubset} from '@mionkit/core';
import {Routes, initMionRouter, headersHook, route} from '@mionkit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';

const authorizationHook = headersHook(
    async (context, headers: HeadersSubset<'Authorization', 'User-id'>): Promise<void | RpcError<'not-authorized'>> => {
        const token = headers.values.Authorization;
        const userId = headers.values['User-id'];
        const me = await getAuthUser(token, userId);
        if (!isAuthorized(me)) {
            return new RpcError({publicMessage: 'user is not authorized', type: 'not-authorized'});
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
