import {HeadersSubset} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {PrefillApi} from './prefill.routes.ts';

const {routes, middleFns} = initClient<PrefillApi>({baseURL: 'http://localhost:3000'});

declare function redirectToLogin(): void;

// prefill() returns a TypedEvent for registering persistent handlers
// the handlers are STRONGLY TYPED by the error.type string
middleFns
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

// auth is prefilled, so call() sends it without passing it again
// A middleware function's declared error reaches BOTH channels: its typed onError
// handler above, and its own slot in the middleFnErrors record
const [sum, error, fatal, middleFnResults, middleFnErrors] = await routes.utils.sum(5, 2).call();

if (middleFnErrors?.auth) console.log('Auth error from tuple:', middleFnErrors.auth.publicMessage);
if (middleFnResults?.auth) console.log('Session from tuple:', middleFnResults.auth);
if (fatal) console.log('Fatal (nobody declared it):', fatal.publicMessage);
if (!error) console.log(sum); // 7
