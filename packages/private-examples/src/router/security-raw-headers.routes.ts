import {createMionRouter, Routes} from '@mionjs/router';
import {mionSecurity} from '@mionjs/router/middlewares';

const mion = createMionRouter();

const routes = {
  mionSecurity: mionSecurity({
    // asked only when a request's origin matters; may be async, like a lookup in your database
    origins: async (ctx, origin) => origin.endsWith('.example.com'),
    cors: {
      // a raw middleware reads and sets these by hand, so no type declares them
      allowHeaders: ['x-request-id'],
      exposeHeaders: ['x-response-time'],
    },
  }),
  timing: mion.rawMiddleware((ctx): void => {
    ctx.response.headers.set('x-response-time', '3ms');
  }),
} satisfies Routes;
