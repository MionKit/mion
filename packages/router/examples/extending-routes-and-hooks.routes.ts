import {Route, HookDef} from '@mionkit/router';

type MyRoute = Route & {doNotFail: boolean};
type MyHook = HookDef & {shouldLog: boolean};

const someRoute: MyRoute = {
    doNotFail: true,
    route: (app, ctx): void => {
        if (someRoute.doNotFail) {
            // do something
        } else {
            throw {statusCode: 400, message: 'operation failed'};
        }
    },
};

const someHook: MyHook = {
    shouldLog: false,
    hook: (app, ctx): void => {
        if (someHook.shouldLog) {
            app.cloudLogs.log('hello');
        } else {
            // do something else
        }
    },
};
