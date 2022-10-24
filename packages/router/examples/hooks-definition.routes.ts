import {Route, Routes, MkRouter, Hook} from '@mikrokit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';

const authorizationHook: Hook = {
    fieldName: 'Authorization',
    inHeader: true,
    async hook(context, token: string): Promise<void> {
        const me = await getAuthUser(token);
        if (!isAuthorized(me)) throw {code: 401, message: 'user is not authorized'};
        context.auth = {me}; // user is added to context to shared with other routes/hooks
    },
};

const getPet: Route = async (context, petId: number): Promise<Pet> => {
    const pet = context.app.deb.getPet(petId);
    // ...
    return pet;
};

const logs: Hook = {
    async hook(context): Promise<void> {
        const me = context.errors;
        if (context.errors) await context.cloudLogs.error(context.errors);
        else context.cloudLogs.log(context.request.path, context.auth.me, context.mkkOutput);
    },
};

const routes: Routes = {
    authorizationHook, // header: Authorization (defined using fieldName)
    users: {
        getPet,
    },
    logs,
};

MkRouter.addRoutes(routes);
