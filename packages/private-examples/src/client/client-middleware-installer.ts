import {HeadersSubset} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {ClientMiddlewareOf} from '@mionjs/client';
import type {MyApi, traceHandler} from './middleware-hooks.routes.ts';

// only the handler's type is imported, so this file never loads the router
export function useTrace(trace: ClientMiddlewareOf<typeof traceHandler>) {
  trace
    .onRequest((call) =>
      call(new HeadersSubset({'X-Trace-Id': crypto.randomUUID()}))
    )
    .onResponse((info) => console.log('Trace:', info.traceId));
}

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});
useTrace(middlewares.trace);

const [sum] = await routes.utils.sum(5, 2).call();
