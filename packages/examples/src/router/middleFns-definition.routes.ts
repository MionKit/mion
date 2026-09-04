import {CallContext, middleFn, Routes} from '@mionjs/router';
import {myApp} from './full-example.app.ts';

const routes = {
  // using the middleFn function to define a middleware function
  logger: middleFn(
    async (ctx: CallContext): Promise<void> => {
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
