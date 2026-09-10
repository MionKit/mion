import {createMionRouter, Routes} from '@mionjs/router';

// The catch-all handler is mounted under `/api`, so the ROUTER carries that prefix: a client
// resolves a route's absolute path against its baseURL, which would drop a prefix set there.
const mion = createMionRouter({basePath: '/api'});

const routes = {
  sayHello: mion.route((ctx, name: string): string => {
    return `Hello ${name}!`;
  }),
} satisfies Routes;

// the router is created and its routes initialized here; the server entry just imports this file
export const myApi = mion.initRoutes(routes);
export type MyApi = typeof myApi;
