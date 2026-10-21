import {createMionRouter, Routes} from '@mionjs/router';
import {mionFetchMetadata, mionSyncRoutes} from '@mionjs/router/middlewares';

const mion = createMionRouter();

const routes = {
  mionFetchMetadata,
  // before your own middleware and routes, so a stopped call runs nothing else
  mionSyncRoutes,
  sayHello: mion.route((ctx, name: string): string => `Hello ${name}`),
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
