import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

const routes = {
  authorizationMiddleFn: mion.middleFn((): void => undefined),
  users: {
    userOnlyMiddleFn: mion.middleFn((): void => undefined), // runs only for routes under users
    getUser: mion.route((): null => null),
    setUser: mion.route((): null => null),
  },
  pets: {
    getPet: mion.route((): null => null),
    setPet: mion.route((): null => null),
  },
  errorHandlerMiddleFn: mion.middleFn((): void => undefined),
  loggingMiddleFn: mion.middleFn((): void => undefined),
} satisfies Routes;

export const myValidApi = mion.initRoutes(routes);
