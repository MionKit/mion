import {Context, registerRoutes} from '@mikrokit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';
import type {Pet} from 'MyModels';

const authorizationHook = {
    fieldName: 'Authorization',
    inHeader: true,
    async hook(app, ctx, token: string): Promise<void> {
        const me = await getAuthUser(token);
        if (!isAuthorized(me)) throw {code: 401, message: 'user is not authorized'};
        ctx.shared.auth = {me}; // user is added to ctx to shared with other routes/hooks
    },
};

const getPet = async (app, ctx, petId: number): Promise<Pet> => {
    const pet = app.deb.getPet(petId);
    // ...
    return pet;
};

const logs = {
    forceRunOnError: true,
    async hook(app, ctx: Context<any>): Promise<void> {
        if (ctx.request) await app.cloudLogs.error(ctx.path, ctx.request.internalErrors);
        else app.cloudLogs.log(ctx.path, ctx.shared.me.name);
    },
};

const routes = {
    authorizationHook, // header: Authorization (defined using fieldName)
    users: {
        getPet,
    },
    logs,
};

export const apiSpec = registerRoutes(routes);
