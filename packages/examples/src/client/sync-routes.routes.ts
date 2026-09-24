import {createMionRouter, Routes} from '@mionjs/router';

// every call must prove it was built against this server's route types
const mion = createMionRouter({syncRoutes: true});

const routes = {
  sayHello: mion.route((ctx, name: string): string => `Hello ${name}`),
} satisfies Routes;

const myApi = mion.initRoutes(routes);

// the client build reads syncRoutes off this type, so the client needs no option of its own
export type MyApi = typeof myApi;
