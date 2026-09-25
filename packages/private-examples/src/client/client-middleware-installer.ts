import {HeadersSubset} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {ClientMiddlewareOf} from '@mionjs/client';
import type {MyApi, authHandler} from './middleware-hooks.routes.ts';

// only the handler's type crosses over, so this file never loads the router
export function useAuth(
  auth: ClientMiddlewareOf<typeof authHandler>,
  getToken: () => Promise<string>,
  refreshToken: () => Promise<boolean>
) {
  auth.onRequest(async (call) =>
    call(new HeadersSubset({Authorization: await getToken()}))
  );
  auth.onError('not-authorized', async (error, context) => {
    // sends the whole call again, and onRequest reads the new token
    if (await refreshToken()) context.retry();
  });
}

declare function getToken(): Promise<string>;
declare function refreshToken(): Promise<boolean>;

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});
useAuth(middlewares.auth, getToken, refreshToken);

const [sum] = await routes.utils.sum(5, 2).call();
