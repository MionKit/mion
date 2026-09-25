import {createMionRouter, Routes} from '@mionjs/router';
import {mionSyncRoutes} from '@mionjs/router/middlewares';

const mion = createMionRouter();

const routes = {
  // first, so a stopped call runs nothing else
  mionSyncRoutes,
  sayHello: mion.route((ctx, name: string): string => `Hello ${name}`),
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
