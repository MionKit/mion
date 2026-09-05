import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

const routes = {
  sayHello: mion.route((ctx, name: string): string => `Hello ${name}`),
} satisfies Routes;

const myApi = await mion.initRoutes(routes);

// the type the client uses, no server code ever reaches the browser
export type MyApi = typeof myApi;
