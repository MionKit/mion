import {HeadersSubset, FatalError} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';
import {getSession} from './session.ts';

const mion = createMionRouter();

const routes = {
  // the client sends a trace id with every request, the server echoes it back
  trace: mion.headersFn(
    (ctx, h: HeadersSubset<'X-Trace-Id'>): string => h.headers['X-Trace-Id']
  ),
  // runs before every route; a returned FatalError ends the request and stays typed
  auth: mion.middleware((ctx): void | FatalError<'not-authorized'> => {
    if (!getSession(ctx.request.headers.get('cookie')))
      return new FatalError({
        publicMessage: 'Not Authorized',
        type: 'not-authorized',
      });
  }),
  sayHello: mion.route((ctx, name: string): string => `Hello ${name}`),
  utils: {
    sum: mion.route((ctx, a: number, b: number): number => a + b),
  },
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
