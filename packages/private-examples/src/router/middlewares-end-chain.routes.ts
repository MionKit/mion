import {createMionRouter, endChain, Routes} from '@mionjs/router';

const mion = createMionRouter();

const routes = {
  // answers a health probe before auth and the route
  health: mion.rawMiddleware((ctx): void => {
    if (ctx.request.headers.get('x-health-check')) endChain(ctx);
  }),
  auth: mion.middleware((ctx): void => undefined),
  sayHello: mion.route((ctx, name: string): string => `Hello ${name}`),
  // alwaysRun: still runs after endChain; stopped with no error means endChain ended it
  log: mion.rawMiddleware(
    (ctx): void => {
      console.log(
        ctx.path,
        ctx.response.statusCode,
        ctx.response.stopped && !ctx.response.hasErrors
      );
    },
    {alwaysRun: true}
  ),
} satisfies Routes;
