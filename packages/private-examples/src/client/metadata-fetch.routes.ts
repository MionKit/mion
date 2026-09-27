import {createMionRouter, Routes} from '@mionjs/router';
import {mionMethodsMetadata} from '@mionjs/router/middlewares';

const mion = createMionRouter();

const routes = {
  // at the root, before any route or group, or the router refuses it
  mionMethodsMetadata,
  sayHello: mion.route((ctx, name: string): string => `Hello ${name}`),
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
