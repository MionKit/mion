import {HeadersSubset, FatalError} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';

export type User = {id: string; name: string; surname: string};

// every helper below gets these options by type
const mion = createMionRouter({basePath: 'api/v1'});

// parameters are validated before each function runs
const routes = {
  auth: mion.headersFn(
    (
      ctx,
      h: HeadersSubset<'Authorization'>
    ): void | FatalError<'not-authorized'> => {
      const token = h.headers.Authorization;
      // a FatalError ends the request: sayHello never runs, and the client gets it typed
      if (!token)
        return new FatalError({
          publicMessage: 'Not Authorized',
          type: 'not-authorized',
        });
    }
  ),
  users: {
    sayHello: mion.route(
      (ctx, user: User): string => `Hello ${user.name} ${user.surname}`
    ),
  },
  log: mion.middleware(
    (ctx): void => console.log(Date.now(), ctx.path, ctx.response.statusCode),
    {alwaysRun: true}
  ),
} satisfies Routes;

export const myApi = mion.initRoutes(routes);

// the client imports only this type
export type MyApi = typeof myApi;
