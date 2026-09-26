import {createMionRouter, Routes} from '@mionjs/router';
import {mionMethodsMetadata} from '@mionjs/router/middlewares';

const mion = createMionRouter();

const routes = {
  // first, so every route below can be described to the client
  ...mionMethodsMetadata,
  sayHello: mion.route((ctx, name: string): string => `Hello ${name}`),
} satisfies Routes;

const myApi = mion.initRoutes(routes);

export type MyApi = typeof myApi;
