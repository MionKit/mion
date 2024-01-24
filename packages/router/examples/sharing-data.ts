import {RpcError} from '@mionkit/core';
import {HeaderHookDef, Routes, initMionRouter} from '@mionkit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';

const authorizationHook = {
    headerName: 'authorization',
    async hook(context, token: string): Promise<void> {
        const me = await getAuthUser(token);
        if (!isAuthorized(me)) {
            throw new RpcError({statusCode: 401, publicMessage: 'user is not authorized'});
        }
        context.shared.myUser = me; // user is added to ctx to shared with other routes/hooks
    },
} satisfies HeaderHookDef;

const sayMyName = (context): string => {
    return `hello ${context.shared.myUser.name}`;
};

const routes = {
    authorizationHook,
    sayMyName,
} satisfies Routes;

export const apiSpec = initMionRouter(routes);
