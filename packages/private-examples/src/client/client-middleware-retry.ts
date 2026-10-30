import {initClient} from '@mionjs/client';
import type {MyApi} from './middleware-hooks.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

declare function refreshSession(): Promise<boolean>;

middlewares.auth.onError('not-authorized', async (error, call) => {
  // the server sets a new session cookie before the retry
  if (await refreshSession()) call.retry();
});

// after a retry, the result is the retried call's
const [sum] = await routes.utils.sum(5, 2).call();
