import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter({syncRoutes: true});

const routes = {
  sayHello: mion.route((ctx, name: string): string => `Hello ${name}`),
} satisfies Routes;

const myApi = mion.initRoutes(routes);

// the client build reads syncRoutes from this type, so the client needs no option
export type MyApi = typeof myApi;
