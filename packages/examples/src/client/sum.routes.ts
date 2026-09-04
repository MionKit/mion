import {Routes, initMionRouter, route} from '@mionjs/router';

const routes = {
  utils: {
    sum: route((ctx, a: number, b: number): number => a + b),
  },
} satisfies Routes;

const myApi = await initMionRouter(routes);

export type MyApi = typeof myApi;
