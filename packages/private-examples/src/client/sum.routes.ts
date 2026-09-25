import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

const routes = {
  utils: {
    sum: mion.route((ctx, a: number, b: number): number => a + b),
  },
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
