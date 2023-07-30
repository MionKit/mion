import {HeaderHookDef, Routes, registerRoutes} from '@mionkit/router';
import {getAuthUser, isAuthorized} from 'MyAuth';

let currentSharedData: any = null;

const authorizationHook = {
    headerName: 'Authorization',
    async headerHook(ctx, token: string): Promise<void> {
        const me = await getAuthUser(token);
        if (!isAuthorized(me)) throw {code: 401, message: 'user is not authorized'};
        ctx.shared.auth = {me}; // user is added to ctx to shared with other routes/hooks

        // THIS IS WRONG! DO NOT STORE THE CONTEXT!
        currentSharedData = ctx.shared;
    },
} satisfies HeaderHookDef;

const wrongSayHello = (ctx): string => {
    // this is wrong! besides currentContext might have changed, it might be also causing memory problems
    return `hello ${currentSharedData?.shared?.auth}`;
};

const sayHello = (ctx): string => {
    return `hello ${ctx.shared.auth}`;
};

const routes = {
    authorizationHook, // header: Authorization
    wrongSayHello,
    sayHello,
} satisfies Routes;

export const apiSpec = registerRoutes(routes);
