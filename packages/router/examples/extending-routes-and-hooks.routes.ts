import {Route, HookDef} from '@mionkit/router';
import {myApp} from './myApp';

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
    hook: (): void => {
        if (someHook.shouldLog) {
            myApp.cloudLogs.log('hello');
        } else {
            // do something else
        }
    },
};
