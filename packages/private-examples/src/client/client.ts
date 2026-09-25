/* eslint-disable @typescript-eslint/no-unused-vars */
import {initClient} from '@mionjs/client';
import {HeadersSubset} from '@mionjs/core';
// importing only the RemoteApi type from server
import type {MyApi} from './server.routes.ts';

const john = {id: '123', name: 'John', surname: 'Doe'};
const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

// ========== Middleware Hooks with Typed Success Return and Error Handling ==========
// onRequest gives auth its params before every request that runs it
// The auth middleware returns SessionInfo on success (when returnSession=true) or FatalError<'not-authorized', NotAuthorizedData>
const authHeaders = new HeadersSubset({Authorization: 'Bearer myToken-XYZ'});
middlewares.auth
  .onRequest((auth) => auth(authHeaders, true)) // returnSession=true to get SessionInfo back
  // onResponse receives the strongly typed SessionInfo (or void when returnSession=false)
  .onResponse((sessionInfo) => {
    // Since we passed returnSession=true, we know sessionInfo is SessionInfo
    // TypeScript infers: sessionInfo is SessionInfo | void, so we narrow it
    if (!sessionInfo) return;
    // Now TypeScript knows sessionInfo is SessionInfo!
    // sessionInfo.role is 'admin' | 'user' | 'guest'
    console.log('Logged in as:', sessionInfo.userId);
    console.log('Role:', sessionInfo.role);
    // Use session info to configure app state
    if (sessionInfo.role === 'admin') {
      console.log('Admin features enabled');
    }
  })
  .onError('not-authorized', (error) => {
    // error.errorData is strongly typed as NotAuthorizedData!
    // TypeScript knows: error.errorData?.reason is 'missing-token' | 'invalid-token' | 'expired-token'
    const reason = error.errorData?.reason;
    if (reason === 'expired-token') {
      console.log('Token expired, refreshing...');
    } else if (reason === 'missing-token') {
      console.log('No token provided, redirecting to login...');
    } else {
      console.log('Invalid token:', error.publicMessage);
    }
  })
  .onError('validation-error', (error) => {
    console.log('Validation error:', error.errorData?.typeErrors);
  });

// ========== Example 1: Route with strongly-typed errorData ==========
// getById returns User | RpcError<'user-not-found', UserNotFoundData>
// call() returns 5-tuple: [routeResult, routeError, undeclared, middlewareResults, middlewareErrors]
const [user1, error1] = await routes.users.getById('USER-123').call();
if (error1 && error1.type === 'user-not-found') {
  // error1.errorData is strongly typed as UserNotFoundData!
  console.log('User not found. Requested ID:', error1.errorData?.requestedId);
  if (error1.errorData?.suggestedIds?.length) {
    console.log(
      'Did you mean one of these?',
      error1.errorData.suggestedIds.join(', ')
    );
  }
} else if (error1) {
  // Catches any other errors (network errors, middleware errors, etc.)
  console.log('Unexpected error:', error1.publicMessage);
}
// After error check, user is guaranteed to be User here
// Use optional chaining for TypeScript strictness
console.log('Found user:', user1?.name, user1?.surname);

// ========== Example 2: Order error with typed errorData ==========
// Order getById returns Order | RpcError<'order-not-found', OrderNotFoundData>
const [order, error2] = await routes.orders.getById('ORDER-404').call();
if (error2 && error2.type === 'order-not-found') {
  // error2.errorData is strongly typed as OrderNotFoundData!
  console.log('Order not found. Requested ID:', error2.errorData?.requestedId);
}
// After error check, order is guaranteed to be Order here
console.log('Order total:', order?.totalUSD);

// ========== Example 3: Route that always succeeds ==========
// sayHello returns just string (no error type), so error is always undefined
const [result, error3] = await routes.users.sayHello(john).call();
// sayHello never has an error type, so we can use the result directly
console.log(result); // Hello John Doe

// ========== Example 5: Per-request middleware data ==========
// the context lets onRequest pick the data per request
const tempAuthHeaders: HeadersSubset<'Authorization'> = {
  headers: {Authorization: 'Bearer temp-token-ABC'},
};
middlewares.auth.onRequest((auth, context) => {
  const isOrderRequest = context.route?.id.startsWith('orders/');
  auth(isOrderRequest ? tempAuthHeaders : authHeaders, true);
});

// the tuple also keeps each middleware's outcome by id, loosely typed; prefer the typed hooks
const [user4, routeError4, fatal4, middlewareResults4, middlewareErrors4] =
  await routes.users.getById('USER-123').call();
// Check for route errors (the route's DECLARED errors | ValidationError)
if (routeError4?.type === 'user-not-found') {
  console.log('User not found:', routeError4.errorData?.requestedId);
}
// the same declared errors the onError hooks got, by id
if (middlewareErrors4?.auth?.type === 'not-authorized') {
  console.log('Auth failed:', middlewareErrors4.auth.publicMessage);
}
// Anything NOBODY declared (transport, platform, an undeclared throw) lands here, untyped
if (fatal4) {
  console.log('Request failed:', fatal4.type, fatal4.publicMessage);
}
// Access success data
if (user4) console.log('Found user:', user4.name);
console.log(middlewareResults4); // { auth: ... }

// ========== Example 7: Using call() with async/await (recommended) ==========
// call() returns 5-tuple: [routeResult, routeError, undeclared, middlewareResults, middlewareErrors]
// This is the standard pattern for all route calls
// call() never throws - returns a 5-tuple
// Partial destructuring still works for backward compatibility
const [user6, error6] = await routes.users.getById('USER-999').call();
if (error6) {
  // TypeScript knows error is the typed error here
  // Each error type can be checked
  if (error6.type === 'user-not-found') {
    // error6.errorData is still strongly typed!
    console.log('User not found:', error6.errorData?.requestedId);
  } else {
    console.log('Other error:', error6.publicMessage);
  }
}
// After error check, user is guaranteed to be User here
// Use optional chaining for TypeScript strictness
console.log('User:', user6?.name, user6?.surname);
// validate parameters locally without calling the server
const validationResp = await routes.users.sayHello(john).typeErrors();
console.log(validationResp); // []
