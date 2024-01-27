import {CallContext, hook, Routes} from '@mionkit/router';
import {myApp} from './myApp';

const routes = {
    // using the hook function to define a hook
    logger: hook(
        async (ctx: CallContext): Promise<void> => {
            const hasErrors = ctx.request.internalErrors.length > 0;
            if (hasErrors) await myApp.cloudLogs.error(ctx.path, ctx.request.internalErrors);
            else myApp.cloudLogs.log(ctx.path, ctx.shared.me.name);
        },
        // ensures logger is executed even if there are errors in the route or other hooks
        {forceRunOnError: true}
    ),
    // ... other routes and hooks
} satisfies Routes;
