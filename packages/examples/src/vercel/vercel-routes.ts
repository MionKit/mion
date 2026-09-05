import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

const routes = {
  sayHello: mion.route((ctx, name: string): string => {
    return `Hello ${name}!`;
  }),
} satisfies Routes;

// the router is created and its routes initialized here; the server entry just imports this file
export const myApi = mion.initRoutes(routes);
export type MyApi = typeof myApi;
