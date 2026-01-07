import {HeadersSubset} from '@mionkit/core';
import {headersHook, hook, Routes} from '@mionkit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';

const routes = {
    // using the headersHook to declare request headers, headers param must be next after context
    auth: headersHook(async (ctx, {headers}: HeadersSubset<'Authorization'>): Promise<void> => {
        const token = headers.Authorization;
        const me = await getAuthUser(token);
        if (!isAuthorized(me)) throw {code: 401, message: 'user is not authorized'};
        ctx.shared.auth = {me}; // user is added to ctx to shared with other routes/hooks
    }),
    // set response headers
    serverName: hook((ctx): HeadersSubset<'Server'> => {
        return new HeadersSubset({Server: 'my-server'});
    }),
    // ... other routes and hooks
} satisfies Routes;
