import {headersHook, Routes} from '@mionkit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';

const routes = {
    // using the headersHook function to define a hook
    auth: headersHook(async (ctx, authorization: string): Promise<void> => {
        const me = await getAuthUser(authorization);
        if (!isAuthorized(me)) throw {code: 401, message: 'user is not authorized'};
        ctx.shared.auth = {me}; // user is added to ctx to shared with other routes/hooks
    }),
    // ... other routes and hooks
} satisfies Routes;
