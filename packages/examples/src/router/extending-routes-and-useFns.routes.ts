import {Route, UseFnDef} from '@mionkit/router';
import {myApp} from './full-example.app.ts';

interface MyRoute extends Route {
    doNotFail: boolean;
}
interface MyUseFn extends UseFnDef {
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

const someUseFn: MyUseFn = {
    shouldLog: false,
    useFn: (): void => {
        if (someUseFn.shouldLog) {
            myApp.cloudLogs.log('hello');
        } else {
            // do something else
        }
    },
};
