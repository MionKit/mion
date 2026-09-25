import {HeadersSubset} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {MyApi} from './middleware-hooks.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

declare function getToken(): Promise<string>;
declare function redirectToLogin(): void;

middlewares.auth
  .onRequest(async (auth) => {
    auth(new HeadersSubset({Authorization: await getToken()}));
  })
  .onResponse((session) => {
    console.log('Authenticated as:', session?.userId);
  })
  .onError('not-authorized', (error) => {
    console.log('Auth failed:', error.errorData?.reason);
    redirectToLogin();
  });

// no middleware data in call(), onRequest sends it
const [sum, error, undeclared, middlewareResults, middlewareErrors] =
  await routes.utils.sum(5, 2).call();

// the tuple also keeps what the hooks got, by middleware id
if (middlewareErrors?.auth)
  console.log('Auth error from tuple:', middlewareErrors.auth.publicMessage);
if (middlewareResults?.auth)
  console.log('Session from tuple:', middlewareResults.auth);
if (undeclared)
  console.log('Undeclared (nobody declared it):', undeclared.publicMessage);
if (!error) console.log(sum); // 7
