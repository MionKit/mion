import {CallContext, useFn, Routes} from '@mionkit/router';
import {myApp} from './full-example.app.ts';

const routes = {
    // using the useFn function to define middleware
    logger: useFn(
        async (ctx: CallContext): Promise<void> => {
            const hasErrors = ctx.request.thrownErrors && Object.keys(ctx.request.thrownErrors).length > 0;
            if (hasErrors) await myApp.cloudLogs.error(ctx.path, ctx.request.thrownErrors);
            else myApp.cloudLogs.log(ctx.path, ctx.shared.me.name);
        },
        // ensures logger is executed even if there are errors in the route or other middleware
        {runOnError: true}
    ),
    // ... other routes and middleware
} satisfies Routes;
