import {RpcError, HeadersSubset} from '@mionkit/core';
import {Routes, initMionRouter, headersFn, route} from '@mionkit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';

const authorizationLinkedFn = headersFn(
    async (context, {headers}: HeadersSubset<'Authorization', 'User-id'>): Promise<void | RpcError<'not-authorized'>> => {
        const token = headers.Authorization;
        const userId = headers['User-id'];
        const me = await getAuthUser(token, userId);
        if (!isAuthorized(me)) {
            return new RpcError({publicMessage: 'user is not authorized', type: 'not-authorized'});
        }
        context.shared.myUser = me; // user is added to ctx to shared with other routes/linkedFns
    }
);

const sayMyName = route((context): string => {
    return `hello ${context.shared.myUser.name}`;
});

const routes = {
    authorizationLinkedFn,
    sayMyName,
} satisfies Routes;

export const apiSpec = await initMionRouter(routes);
