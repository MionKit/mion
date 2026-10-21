import {HeadersSubset} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {ClientMiddlewareOf} from '@mionjs/client';
import type {MyApi, authHandler} from './middleware-hooks.routes.ts';

// only the handler's type crosses over, so this file never loads the router
export function useAuth(
  auth: ClientMiddlewareOf<typeof authHandler>,
  refreshSession: () => Promise<boolean>
) {
  auth.onError('not-authorized', async (error, context) => {
    // the server sets a new session cookie, then the whole call is sent again
    if (await refreshSession()) context.retry();
  });
}

declare function refreshSession(): Promise<boolean>;

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});
useAuth(middlewares.auth, refreshSession);
middlewares.trace.onRequest((trace) =>
  trace(new HeadersSubset({'X-Trace-Id': crypto.randomUUID()}))
);

const [sum] = await routes.utils.sum(5, 2).call();
