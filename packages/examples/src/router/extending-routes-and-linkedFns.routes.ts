import {Route, LinkedFnDef} from '@mionkit/router';
import {myApp} from './full-example.app.ts';

interface MyRoute extends Route {
    doNotFail: boolean;
}
interface MyLinkedFn extends LinkedFnDef {
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

const someLinkedFn: MyLinkedFn = {
    shouldLog: false,
    linkedFn: (): void => {
        if (someLinkedFn.shouldLog) {
            myApp.cloudLogs.log('hello');
        } else {
            // do something else
        }
    },
};
