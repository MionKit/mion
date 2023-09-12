import {CallContext, RawHookDef, registerRoutes} from '@mionkit/router';
import {IncomingMessage, ServerResponse} from 'http';
type HttpRequest = IncomingMessage & {body: any};

// sends a fake progress to the client
const progress = {
    // isRawHook = true, required when defining a RawHook
    isRawHook: true,
    hook: async (ctx: CallContext, rawRequest: HttpRequest, rawResponse: ServerResponse): Promise<void> => {
        return new Promise((resolve) => {
            const maxTime = 1000;
            const increment = 10;
            let total = 0;
            const intervale = setInterval(() => {
                if (total >= maxTime) {
                    clearInterval(intervale);
                    resolve();
                }
                total += increment;
                rawResponse.write(`\n${total}%`);
            }, increment);
        });
    },
} satisfies RawHookDef<any, HttpRequest, ServerResponse>;

registerRoutes({
    progress,
    // ... other routes and hooks
});
