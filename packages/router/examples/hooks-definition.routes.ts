import {CallContext, Routes, registerRoutes} from '@mionkit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';
import type {Pet} from 'MyModels';
import {myApp} from './myApp';

const authorizationHook = {
    headerName: 'Authorization',
    async headerHook(ctx, token: string): Promise<void> {
        const me = await getAuthUser(token);
        if (!isAuthorized(me)) throw {code: 401, message: 'user is not authorized'};
        ctx.shared.auth = {me}; // user is added to ctx to shared with other routes/hooks
    },
};

const getPet = async (ctx, petId: number): Promise<Pet> => {
    const pet = myApp.deb.getPet(petId);
    // ...
    return pet;
};

const logs = {
    forceRunOnError: true,
    async hook(ctx: CallContext): Promise<void> {
        if (ctx.request) await myApp.cloudLogs.error(ctx.path, ctx.request.internalErrors);
        else myApp.cloudLogs.log(ctx.path, ctx.shared.me.name);
    },
};

const routes = {
    authorizationHook, // header: Authorization (defined using fieldName)
    users: {
        getPet,
    },
    logs,
} satisfies Routes;

export const apiSpec = registerRoutes(routes);
