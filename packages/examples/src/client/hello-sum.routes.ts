import {Routes, initMionRouter, route} from '@mionjs/router';

const routes = {
  sayHello: route((ctx, name: string): string => `Hello ${name}`),
  utils: {
    sum: route((ctx, a: number, b: number): number => a + b),
  },
} satisfies Routes;

const myApi = await initMionRouter(routes);

export type HelloSumApi = typeof myApi;
