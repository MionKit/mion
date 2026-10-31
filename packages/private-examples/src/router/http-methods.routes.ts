import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

const routes = {
  // default GET and POST: the client uses GET, and POST when the URL is too long
  getUser: mion.query((ctx, id: number): string => `user ${id}`),
  // only GET: a call whose params do not fit in the URL fails in the client
  getAvatar: mion.query((ctx, id: number): string => `avatar ${id}`, {
    httpMethods: ['GET'],
  }),
  // default POST only: a GET, a link or an image never runs it
  deleteUser: mion.mutation((ctx, id: number): boolean => true),
} satisfies Routes;
