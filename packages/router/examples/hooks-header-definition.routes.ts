import {headersHook, hook, HeadersList, Routes} from '@mionkit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';

const routes = {
    // using the headersHook to declare request headers, headers param must be next after context
    auth: headersHook(async (ctx, [token]: HeadersList<['Authorization']>): Promise<void> => {
        const me = await getAuthUser(token);
        if (!isAuthorized(me)) throw {code: 401, message: 'user is not authorized'};
        ctx.shared.auth = {me}; // user is added to ctx to shared with other routes/hooks
    }),
    // set response headers
    serverName: hook((ctx): HeadersList<['Server']> => {
        return ['my-server'];
    }),
    // ... other routes and hooks
} satisfies Routes;
