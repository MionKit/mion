import {Routes, initMionRouter, middleFn, route} from '@mionjs/router';

const routes = {
  authorizationMiddleFn: middleFn((): void => undefined), // middleware function
  users: {
    userOnlyMiddleFn: middleFn((): void => undefined), // scoped middleware function
    getUser: route((): null => null), // route
    setUser: route((): null => null), // route
  },
  pets: {
    getPet: route((): null => null), // route
    setPet: route((): null => null), // route
  },
  errorHandlerMiddleFn: middleFn((): void => undefined), // middleware function
  loggingMiddleFn: middleFn((): void => undefined), // middleware function
} satisfies Routes;

export const myValidApi = await initMionRouter(routes);
