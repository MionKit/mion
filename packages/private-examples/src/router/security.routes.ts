import {HeadersSubset} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';
import {mionSecurity, mionFetchMetadata} from '@mionjs/router/middlewares';

const mion = createMionRouter();

type User = {name: string; surname: string};

const routes = {
  // first, before the auth middleware
  mionSecurity: mionSecurity({
    origins: ['https://app.example.com'],
    cors: {credentials: true, maxAge: 600},
  }),
  mionFetchMetadata,
  auth: mion.headersMiddleware(
    (ctx, {headers}: HeadersSubset<'Authorization'>): void => undefined
  ),
  // `x-ratelimit-remaining` is exposed to the browser with no CORS setting
  rateLimit: mion.middleware(
    (ctx): HeadersSubset<'x-ratelimit-remaining'> =>
      new HeadersSubset({'x-ratelimit-remaining': '99'})
  ),
  listUsers: mion.query((ctx): User[] => [{name: 'John', surname: 'Doe'}]),
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
