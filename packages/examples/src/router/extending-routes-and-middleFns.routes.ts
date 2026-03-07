import {Route, MiddleFnDef} from '@mionjs/router';
import {myApp} from './full-example.app.ts';

interface MyRoute extends Route {
    doNotFail: boolean;
}
interface MyMiddleFn extends MiddleFnDef {
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

const someMiddleFn: MyMiddleFn = {
    shouldLog: false,
    middleFn: (): void => {
        if (someMiddleFn.shouldLog) {
            myApp.cloudLogs.log('hello');
        } else {
            // do something else
        }
    },
};
