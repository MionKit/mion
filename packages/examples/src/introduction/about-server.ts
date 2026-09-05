import {createMionRouter, Routes} from '@mionjs/router';
import {startNodeServer} from '@mionjs/platform-node';

const mion = createMionRouter();

const routes = {
  // fully validated params
  sayHello: mion.route((ctx, name: string): string => {
    return `Hello ${name}!`;
  }),
} satisfies Routes;

export const myApi = mion.initRoutes(routes);
startNodeServer({port: 3000});
export type MyApi = typeof myApi;
