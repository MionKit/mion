import {addRoutes} from '@mikrokit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';
import type {Pet} from 'MyModels';

const authorizationHook = {
    fieldName: 'Authorization',
    inHeader: true,
    async hook(context: any, token: string): Promise<void> {
        const me = await getAuthUser(token);
        if (!isAuthorized(me)) throw {code: 401, message: 'user is not authorized'};
        context.auth = {me}; // user is added to context to shared with other routes/hooks
    },
};

const getPet = async (context, petId: number): Promise<Pet> => {
    const pet = context.app.deb.getPet(petId);
    // ...
    return pet;
};

const logs = {
    async hook(context: any): Promise<void> {
        const me = context.errors;
        if (context.errors) await context.cloudLogs.error(context.errors);
        else context.cloudLogs.log(context.request.path, context.auth.me, context.mkkOutput);
    },
};

const routes = {
    authorizationHook, // header: Authorization (defined using fieldName)
    users: {
        getPet,
    },
    logs,
};

export const apiSpec = addRoutes(routes);
