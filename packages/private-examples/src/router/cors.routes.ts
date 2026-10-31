import {HeadersSubset} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';
import {mionCors, mionFetchMetadata} from '@mionjs/router/middlewares';

const mion = createMionRouter();

const routes = {
  // first, before the auth middleware
  cors: mionCors({
    origin: ['https://app.example.com'],
    credentials: true,
    maxAge: 600,
  }),
  mionFetchMetadata,
  auth: mion.headersMiddleware(
    (ctx, {headers}: HeadersSubset<'Authorization'>): void => undefined
  ),
  // `x-total` is exposed to the browser with no CORS setting
  listUsers: mion.query(
    (ctx): HeadersSubset<'x-total'> => new HeadersSubset({'x-total': '2'})
  ),
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
