import {HeadersSubset, isRpcError} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {AuthUserApi} from './auth-user.routes.ts';

const {routes, middleFns} = initClient<AuthUserApi>({baseURL: 'http://localhost:3000'});

// [routeResult, routeError, fatal, middleFnResults, middleFnErrors]
// - error: the route's DECLARED errors | ValidationError (strongly typed, CLOSED union)
// - fatal: anything NOBODY declared - transport, platform, framework, an undeclared throw,
//   or an error for a middleware function that was not part of the request (OPEN RpcError<string>)
// - middleFnErrors: each middleware function's DECLARED errors, by name (strongly typed)
const [user, error, fatal, , middleFnErrors] = await routes.users.getById('USER-404').call({
  middleFns: {auth: middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'}))},
});

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
} else if (middleFnErrors?.auth?.type === 'not-authorized') {
  // the middleware function's declared error, also strongly typed
  console.log('auth failed:', middleFnErrors.auth.errorData?.reason);
} else if (fatal) {
  // transport, platform or any undeclared error lands here
  if (isRpcError(fatal)) console.log('request failed:', fatal.type);
} else {
  console.log(user?.name); // John
}

// typeErrors() is the only method that can throw
try {
  const errors = await routes.users.getById(null as any).typeErrors();
  console.log(errors); // [] (empty array if no errors)
} catch (validationError: any) {
  console.log(validationError); // { type: 'validation-error', message: `Invalid params ...` }
}
