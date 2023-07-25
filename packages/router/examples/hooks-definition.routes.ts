import {CallContext, HookDef, registerRoutes} from '@mionkit/router';
import {myApp} from './myApp';

const logger = {
    // ensures logger is executed even if there are errors in the route or other hooks
    forceRunOnError: true,
    hook: async (ctx: CallContext): Promise<void> => {
        const hasErrors = ctx.request.internalErrors.length > 0;
        if (hasErrors) await myApp.cloudLogs.error(ctx.path, ctx.request.internalErrors);
        else myApp.cloudLogs.log(ctx.path, ctx.shared.me.name);
    },
} satisfies HookDef;

registerRoutes({
    // ... other routes and hooks
    logger, // logs things after all other hooks and routes are executed
});
