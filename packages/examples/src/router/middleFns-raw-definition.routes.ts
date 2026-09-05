import {Routes} from '@mionjs/router';
import {IncomingMessage, ServerResponse} from 'http';
import {mion} from './full-example.app.ts';
type HttpRequest = IncomingMessage & {body: any};

const routes = {
  // using mion.rawMiddleFn to define a raw middleware function
  progress: mion.rawMiddleFn(
    async (
      ctx,
      rawRequest: HttpRequest,
      rawResponse: ServerResponse
    ): Promise<void> => {
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
    }
  ),
  // ... other routes and middleware functions
} satisfies Routes;
