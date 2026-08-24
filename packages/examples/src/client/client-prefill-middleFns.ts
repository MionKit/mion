import {initClient} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';
import {HeadersSubset} from '@mionjs/core';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

declare function redirectToLogin(): void;
declare function refreshToken(): Promise<string>;

// prefill() returns a TypedEvent for registering persistent handlers
// TypedEvent handlers are STRONGLY TYPED by the error.type string
middleFns
  .auth(new HeadersSubset({Authorization: 'myToken-XYZ'}))
  .prefill()
  .onSuccess((session) => {
    // Called after every successful auth
    console.log('Authenticated as:', session?.userId);
  })
  .onError('not-authorized', (error) => {
    // TypeScript knows error.type is 'invalid-token'
    console.log('Auth failed:', error.publicMessage);
    redirectToLogin();
  });

// call() returns a 5-tuple: [result, error, fatal, middleFnResults, middleFnErrors]
// A middleFn's declared error reaches BOTH channels: its typed onError handler (above)
// and its own slot in the middleFnErrors record
const [sum, error, fatal, middleFnResults, middleFnErrors] = await routes.utils.sum(5, 2).call();

if (middleFnErrors?.auth) {
  console.log('Auth error from tuple:', middleFnErrors.auth.publicMessage);
}
if (middleFnResults?.auth) {
  console.log('Session from tuple:', middleFnResults.auth);
}
if (fatal) {
  console.log('Fatal (nobody declared it):', fatal.publicMessage);
}
if (!error) {
  console.log(sum); // 7
}
