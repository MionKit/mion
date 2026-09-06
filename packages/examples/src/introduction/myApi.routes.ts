import {HeadersSubset, FatalError} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';

export type User = {id: string; name: string; surname: string};

// create the router once, options included: every helper below carries them by type
const mion = createMionRouter({basePath: 'api/v1'});

// all function parameters will be automatically validated before the function is called
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
  log: mion.middleFn(
    (ctx): void => console.log(Date.now(), ctx.path, ctx.response.statusCode),
    {alwaysRun: true}
  ),
} satisfies Routes;

export const myApi = mion.initRoutes(routes);

// Export the type of the Api (used by the client)
export type MyApi = typeof myApi;
