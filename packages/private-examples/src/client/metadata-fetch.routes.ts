import {createMionRouter, Routes} from '@mionjs/router';
import {mionFetchMetadata} from '@mionjs/router/middlewares';

const mion = createMionRouter();

const routes = {
  // at the root, before any route or group, or the router refuses it
  mionFetchMetadata,
  sayHello: mion.route((ctx, name: string): string => `Hello ${name}`),
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
