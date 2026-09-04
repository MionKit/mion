import {HeadersSubset, RpcError} from '@mionjs/core';
import {Routes, headersFn, initMionRouter, route} from '@mionjs/router';

const routes = {
  // reads the Authorization header, runs before every route below
  auth: headersFn((ctx, h: HeadersSubset<'Authorization'>): void | RpcError<'not-authorized'> => {
    if (!h.headers.Authorization) throw new RpcError({publicMessage: 'Not Authorized', type: 'not-authorized'});
  }),
  sayHello: route((ctx, name: string): string => `Hello ${name}`),
  utils: {
    sum: route((ctx, a: number, b: number): number => a + b),
  },
} satisfies Routes;

const myApi = await initMionRouter(routes);

export type HelloSumAuthApi = typeof myApi;
