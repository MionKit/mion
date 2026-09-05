import {createMionRouter, Routes} from '@mionjs/router';
import {myApp, getSharedData} from './full-example.app.ts';

const mion = createMionRouter({contextDataFactory: getSharedData});

const routes = {
  // using mion.middleFn to define a middleware function
  logger: mion.middleFn(
    async (ctx): Promise<void> => {
      const hasErrors =
        ctx.request.thrownErrors &&
        Object.keys(ctx.request.thrownErrors).length > 0;
      if (hasErrors)
        await myApp.cloudLogs.error(ctx.path, ctx.request.thrownErrors);
      else myApp.cloudLogs.log(ctx.path, ctx.shared.me.name);
    },
    // ensures logger is executed even if there are errors in the route or other middleware functions
    {runOnError: true}
  ),
  // ... other routes and middleware functions
} satisfies Routes;
