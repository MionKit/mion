import {HeadersSubset} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {MyApi} from './prefill.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

declare function redirectToLogin(): void;

// prefill() returns a TypedEvent for persistent handlers, typed by error.type
middlewares
  .auth(new HeadersSubset({Authorization: 'myToken-XYZ'}))
  .prefill()
  .onSuccess((session) => {
    // called after every successful auth
    console.log('Authenticated as:', session?.userId);
  })
  .onError('not-authorized', (error) => {
    // TypeScript knows error.errorData is NotAuthorizedData
    console.log('Auth failed:', error.errorData?.reason);
    redirectToLogin();
  });

// auth is prefilled, so call() sends it; its declared error reaches onError above AND middlewareErrors
const [sum, error, undeclared, middlewareResults, middlewareErrors] =
  await routes.utils.sum(5, 2).call();

if (middlewareErrors?.auth)
  console.log('Auth error from tuple:', middlewareErrors.auth.publicMessage);
if (middlewareResults?.auth)
  console.log('Session from tuple:', middlewareResults.auth);
if (undeclared)
  console.log('Undeclared (nobody declared it):', undeclared.publicMessage);
if (!error) console.log(sum); // 7
