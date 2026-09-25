import {HeadersSubset, isRpcError} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {MyApi} from './auth-user.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

middlewares.auth.onRequest((auth) =>
  auth(new HeadersSubset({Authorization: 'myToken-XYZ'}))
);

// [routeResult, routeError, undeclared, middlewareResults, middlewareErrors]
// - error: the route's DECLARED errors | ValidationError (strongly typed, CLOSED union)
// - undeclared: anything NOBODY declared - transport, platform, framework,
//   an undeclared throw, or an error for a middleware that
//   was not part of the request (OPEN RpcError<string>)
// - middlewareErrors: each middleware's DECLARED errors, by middleware id
const [user, error, undeclared, , middlewareErrors] = await routes.users
  .getById('USER-404')
  .call();

// error.type is the discriminator, never the HTTP status code
if (error) {
  switch (error.type) {
    case 'user-not-found':
      // declared payloads survive narrowing: errorData is UserNotFoundData
      console.log('missing user:', error.errorData?.requestedId);
      break;
    case 'validation-error':
      console.log('type errors:', error.errorData?.typeErrors.length);
      break;
  }
} else if (middlewareErrors?.auth) {
  // the middleware's declared error; its onError hook gets it strongly typed
  console.log('auth failed:', middlewareErrors.auth.type);
} else if (undeclared) {
  // transport, platform or any undeclared error lands here
  if (isRpcError(undeclared)) console.log('request failed:', undeclared.type);
} else {
  console.log(user?.name); // John
}

// typeErrors() is the only method that can throw
try {
  const errors = await routes.users.getById(null as any).typeErrors();
  console.log(errors); // [] (empty array if no errors)
} catch (validationError: any) {
  // { type: 'validation-error', message: `Invalid params ...` }
  console.log(validationError);
}
