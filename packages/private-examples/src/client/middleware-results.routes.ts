import {FatalError} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';
import {getSession, type SessionInfo} from './session.ts';

const mion = createMionRouter();

const routes = {
  auth: mion.middleware(
    (ctx): SessionInfo | FatalError<'not-authorized'> =>
      getSession(ctx.request.headers.get('cookie')) ??
      new FatalError({type: 'not-authorized', publicMessage: 'Not Authorized'})
  ),
  utils: {
    sum: mion.route((ctx, a: number, b: number): number => a + b),
  },
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
