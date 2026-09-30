import {createMionRouter, Routes} from '@mionjs/router';
import {mionMethodsMetadata, mionSyncRoutes} from '@mionjs/router/middlewares';

const mion = createMionRouter();

const routes = {
  // only if you use it, and always first
  mionMethodsMetadata,
  // before your own middleware and routes, so a stopped call runs nothing else
  mionSyncRoutes,
  sayHello: mion.route((ctx, name: string): string => `Hello ${name}`),
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
