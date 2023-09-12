import {HeaderHookDef, registerRoutes} from '@mionkit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';

const auth = {
    // headerName is required when defining a HeaderHook
    headerName: 'authorization',
    hook: async (ctx, token: string): Promise<void> => {
        const me = await getAuthUser(token);
        if (!isAuthorized(me)) throw {code: 401, message: 'user is not authorized'};
        ctx.shared.auth = {me}; // user is added to ctx to shared with other routes/hooks
    },
} satisfies HeaderHookDef;

registerRoutes({
    auth,
    // ... other routes and hooks. If auth fails they wont get executed
});
