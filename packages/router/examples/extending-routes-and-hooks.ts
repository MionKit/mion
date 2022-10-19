import {Route, Hook} from '@mikrokit/router';

type MyRoute = Route & {doNotFail: boolean};
type MyHook = Hook & {shouldLog: boolean};

const someRoute: MyRoute = {
    doNotFail: true,
    route: () => {
        if (someRoute.doNotFail) {
            // do something
        } else {
            throw {statusCode: 400, message: 'operation failed'};
        }
    },
};

const someHook: MyHook = {
    shouldLog: false,
    hook: (context) => {
        if (someHook.shouldLog) {
            context.app.cloudLogs.log('hello');
        } else {
            // do something else
        }
    },
};
