import {HeadersSubset} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {MyApi} from './middleware-hooks.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

declare function getToken(): Promise<string>;
declare function redirectToLogin(): void;

middlewares.auth
  // runs before every request that includes auth, sync or async
  .onRequest(async (auth) => {
    auth(new HeadersSubset({Authorization: await getToken()}));
  })
  // runs after every successful auth
  .onResponse((session) => {
    console.log('Authenticated as:', session?.userId);
  })
  // runs after every declared auth error, typed by error.type
  .onError('not-authorized', (error) => {
    console.log('Auth failed:', error.errorData?.reason);
    redirectToLogin();
  });

// auth runs its onRequest, so call() needs no middleware data
const [sum, error, undeclared, middlewareResults, middlewareErrors] =
  await routes.utils.sum(5, 2).call();

// the hooks above already got these; the tuple keeps them by middleware id too
if (middlewareErrors?.auth)
  console.log('Auth error from tuple:', middlewareErrors.auth.publicMessage);
if (middlewareResults?.auth)
  console.log('Session from tuple:', middlewareResults.auth);
if (undeclared)
  console.log('Undeclared (nobody declared it):', undeclared.publicMessage);
if (!error) console.log(sum); // 7
