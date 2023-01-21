import {Route, HookDef} from '@mikrokit/router';

type MyRoute = Route & {doNotFail: boolean};
type MyHook = HookDef & {shouldLog: boolean};

const someRoute: MyRoute = {
    doNotFail: true,
    route: (): void => {
        if (someRoute.doNotFail) {
            // do something
        } else {
            throw {statusCode: 400, message: 'operation failed'};
        }
    },
};

const someHook: MyHook = {
    shouldLog: false,
    hook: (context): void => {
        if (someHook.shouldLog) {
            context.app.cloudLogs.log('hello');
        } else {
            // do something else
        }
    },
};
