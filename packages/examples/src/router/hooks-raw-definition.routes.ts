import {rawHook, Routes} from '@mionkit/router';
import {IncomingMessage, ServerResponse} from 'http';
type HttpRequest = IncomingMessage & {body: any};

const routes = {
    // using the rawHook function to define a hook
    progress: rawHook(async (ctx, rawRequest: HttpRequest, rawResponse: ServerResponse): Promise<void> => {
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
    }),
    // ... other routes and hooks
} satisfies Routes;
