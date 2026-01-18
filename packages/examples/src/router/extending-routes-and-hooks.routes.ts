import {Route, HookDef} from '@mionkit/router';
import {myApp} from './myApp';

interface MyRoute extends Route {
    doNotFail: boolean;
}
interface MyHook extends HookDef {
    shouldLog: boolean;
}

const someRoute: MyRoute = {
    doNotFail: true,
    route: (): void => {
        if (someRoute.doNotFail) {
            // do something
        } else {
            throw {message: 'operation failed'};
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
