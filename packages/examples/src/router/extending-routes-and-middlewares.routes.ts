import {HandlerType, RpcError} from '@mionjs/core';
import {Route, MiddlewareDef} from '@mionjs/router';
import {myApp} from './full-example.app.ts';

// Route and MiddlewareDef are plain object types, so you can extend them with your own metadata
// and still register them like any other definition.
interface MyRoute extends Route {
  doNotFail: boolean;
}
interface MyMiddleware extends MiddlewareDef {
  shouldLog: boolean;
}

const someRoute: MyRoute = {
  doNotFail: true,
  type: HandlerType.route,
  handler: (): void | RpcError<'operation-failed'> => {
    if (someRoute.doNotFail) {
      // do something
    } else {
      // a plain RpcError: the route reports its own failure, the rest of the chain keeps running
      return new RpcError({
        publicMessage: 'operation failed',
        type: 'operation-failed',
      });
    }
  },
};

const someMiddleware: MyMiddleware = {
  shouldLog: false,
  type: HandlerType.middleware,
  handler: (): void => {
    if (someMiddleware.shouldLog) {
      myApp.cloudLogs.log('hello');
    } else {
      // do something else
    }
  },
};

export const routes = {someRoute, someMiddleware};
