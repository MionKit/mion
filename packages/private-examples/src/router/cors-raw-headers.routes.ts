import {createMionRouter, Routes} from '@mionjs/router';
import {mionCors} from '@mionjs/router/middlewares';

const mion = createMionRouter();

const routes = {
  cors: mionCors({
    origin: /^https:\/\/[a-z]+\.example\.com$/,
    // a raw middleware reads and sets these by hand, so no type declares them
    allowHeaders: ['x-request-id'],
    exposeHeaders: ['x-response-time'],
  }),
  timing: mion.rawMiddleware((ctx): void => {
    ctx.response.headers.set('x-response-time', '3ms');
  }),
} satisfies Routes;
