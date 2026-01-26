import {CallContext, linkedFn, Routes} from '@mionkit/router';
import {myApp} from './myApp';

const routes = {
    // using the linkedFn function to define a linkedFn
    logger: linkedFn(
        async (ctx: CallContext): Promise<void> => {
            const hasErrors = ctx.request.thrownErrors && Object.keys(ctx.request.thrownErrors).length > 0;
            if (hasErrors) await myApp.cloudLogs.error(ctx.path, ctx.request.thrownErrors);
            else myApp.cloudLogs.log(ctx.path, ctx.shared.me.name);
        },
        // ensures logger is executed even if there are errors in the route or other linkedFns
        {runOnError: true}
    ),
    // ... other routes and linkedFns
} satisfies Routes;
