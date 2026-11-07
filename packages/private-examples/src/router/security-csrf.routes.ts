import {createMionRouter, Routes} from '@mionjs/router';
import {mionSecurity} from '@mionjs/router/middlewares';

const mion = createMionRouter();

const routes = {
  // no options: same-origin browsers and non-browser callers pass, CORS is off
  mionSecurity: mionSecurity(),
  getUser: mion.query((ctx, id: number): string => `user ${id}`),
  // POST only: a link or an image on another site never runs it
  deleteUser: mion.mutation((ctx, id: number): boolean => true),
} satisfies Routes;
