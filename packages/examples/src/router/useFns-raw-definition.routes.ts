import {useRawFn, Routes} from '@mionkit/router';
import {IncomingMessage, ServerResponse} from 'http';
type HttpRequest = IncomingMessage & {body: any};

const routes = {
    // using the useRawFn function to define a middleware
    progress: useRawFn(async (ctx, rawRequest: HttpRequest, rawResponse: ServerResponse): Promise<void> => {
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
    // ... other routes and middleware
} satisfies Routes;
