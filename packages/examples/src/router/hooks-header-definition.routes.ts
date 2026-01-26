import {HeadersSubset, RpcError} from '@mionkit/core';
import {headersFn, linkedFn, Routes} from '@mionkit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';

const routes = {
    // using the headersFn to declare request headers, headers param must be next after context
    auth: headersFn(async (ctx, {headers}: HeadersSubset<'Authorization'>): Promise<void | RpcError<'not-authorized'>> => {
        const token = headers.Authorization;
        const me = await getAuthUser(token);
        if (!isAuthorized(me)) {
            return new RpcError({type: 'not-authorized', publicMessage: 'User is not authorized'});
        }
        ctx.shared.auth = {me}; // user is added to ctx to shared with other routes/linkedFns
    }),
    // set response headers
    serverName: linkedFn((ctx): HeadersSubset<'Server'> => {
        return new HeadersSubset({Server: 'my-server'});
    }),
    // ... other routes and linkedFns
} satisfies Routes;
