import {RpcError, HeadersSubset} from '@mionjs/core';
import {Routes, initMionRouter, headersFn, route} from '@mionjs/router';
import {getAuthUser, isAuthorized} from 'MyAuth';

const authorizationMiddleFn = headersFn(
    async (context, {headers}: HeadersSubset<'Authorization', 'User-id'>): Promise<void | RpcError<'not-authorized'>> => {
        const token = headers.Authorization;
        const userId = headers['User-id'];
        const me = await getAuthUser(token, userId);
        if (!isAuthorized(me)) {
            return new RpcError({publicMessage: 'user is not authorized', type: 'not-authorized'});
        }
        context.shared.myUser = me; // user is added to ctx to shared with other routes/middleFns
    }
);

const sayMyName = route((context): string => {
    return `hello ${context.shared.myUser.name}`;
});

const routes = {
    authorizationMiddleFn,
    sayMyName,
} satisfies Routes;

export const apiSpec = await initMionRouter(routes);
