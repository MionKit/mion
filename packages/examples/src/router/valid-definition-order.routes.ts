import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

const routes = {
  authorizationMiddleware: mion.middleware((): void => undefined),
  users: {
    userOnlyMiddleware: mion.middleware((): void => undefined), // runs only for routes under users
    getUser: mion.route((): null => null),
    setUser: mion.route((): null => null),
  },
  pets: {
    getPet: mion.route((): null => null),
    setPet: mion.route((): null => null),
  },
  errorHandlerMiddleware: mion.middleware((): void => undefined),
  loggingMiddleware: mion.middleware((): void => undefined),
} satisfies Routes;

export const myValidApi = mion.initRoutes(routes);
