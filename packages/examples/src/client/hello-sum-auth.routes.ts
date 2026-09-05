import {HeadersSubset, RpcError} from '@mionjs/core';
import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

const routes = {
  // reads the Authorization header, runs before every route below
  auth: mion.headersFn(
    (
      ctx,
      h: HeadersSubset<'Authorization'>
    ): void | RpcError<'not-authorized'> => {
      if (!h.headers.Authorization)
        throw new RpcError({
          publicMessage: 'Not Authorized',
          type: 'not-authorized',
        });
    }
  ),
  sayHello: mion.route((ctx, name: string): string => `Hello ${name}`),
  utils: {
    sum: mion.route((ctx, a: number, b: number): number => a + b),
  },
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
