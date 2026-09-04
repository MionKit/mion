import {Routes, initMionRouter, route} from '@mionjs/router';

const routes = {
  sayHello: route((ctx, name: string): string => `Hello ${name}`),
} satisfies Routes;

const myApi = await initMionRouter(routes);

// the type the client uses, no server code ever reaches the browser
export type HelloApi = typeof myApi;
