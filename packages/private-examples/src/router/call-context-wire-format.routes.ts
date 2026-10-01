import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

const routes = {
  // takes a token and returns the seconds left on the session
  auth: mion.middleware((ctx, token: string): number => 3600),
  users: {
    getUser: mion.route((ctx, id: number): {id: number; name: string} => ({
      id,
      name: 'Leo',
    })),
  },
} satisfies Routes;

export const api = mion.initRoutes(routes);
