import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

const routes = {
  sayHello: mion.route((ctx, name: string): string => {
    return `Hello ${name}!`;
  }),
} satisfies Routes;

// the server entry only imports this file
export const myApi = mion.initRoutes(routes);
export type MyApi = typeof myApi;
