import {createMionRouter, Routes} from '@mionjs/router';

// the catch-all handler is mounted under /api, so the router gets that prefix
const mion = createMionRouter({basePath: '/api'});

const routes = {
  sayHello: mion.route((ctx, name: string): string => {
    return `Hello ${name}!`;
  }),
} satisfies Routes;

// the server entry only imports this file
export const myApi = mion.initRoutes(routes);
export type MyApi = typeof myApi;
