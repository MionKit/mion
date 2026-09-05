import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

const routes = {
  authorizationMiddleFn: mion.middleFn((): void => undefined), // middleware function
  users: {
    userOnlyMiddleFn: mion.middleFn((): void => undefined), // scoped middleware function
    getUser: mion.route((): null => null), // route
    setUser: mion.route((): null => null), // route
  },
  pets: {
    getPet: mion.route((): null => null), // route
    setPet: mion.route((): null => null), // route
  },
  errorHandlerMiddleFn: mion.middleFn((): void => undefined), // middleware function
  loggingMiddleFn: mion.middleFn((): void => undefined), // middleware function
} satisfies Routes;

export const myValidApi = await mion.initRoutes(routes);
