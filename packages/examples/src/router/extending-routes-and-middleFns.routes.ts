import {HandlerType} from '@mionjs/core';
import {Route, MiddleFnDef} from '@mionjs/router';
import {myApp} from './full-example.app.ts';

// Route and MiddleFnDef are plain object types, so you can extend them with your own metadata
// and still register them like any other definition.
interface MyRoute extends Route {
    doNotFail: boolean;
}
interface MyMiddleFn extends MiddleFnDef {
    shouldLog: boolean;
}

const someRoute: MyRoute = {
    doNotFail: true,
    type: HandlerType.route,
    handler: (): void => {
        if (someRoute.doNotFail) {
            // do something
        } else {
            throw {message: 'operation failed'};
        }
    },
};

const someMiddleFn: MyMiddleFn = {
    shouldLog: false,
    type: HandlerType.middleFn,
    handler: (): void => {
        if (someMiddleFn.shouldLog) {
            myApp.cloudLogs.log('hello');
        } else {
            // do something else
        }
    },
};

export const routes = {someRoute, someMiddleFn};
