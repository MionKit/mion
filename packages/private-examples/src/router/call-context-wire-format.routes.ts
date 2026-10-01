import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

const routes = {
  // takes a trace id and returns the time the server got the request
  trace: mion.middleware((ctx, traceId: string): number => Date.now()),
  users: {
    getUser: mion.route((ctx, id: number): {id: number; name: string} => ({
      id,
      name: 'Leo',
    })),
  },
} satisfies Routes;

export const api = mion.initRoutes(routes);
