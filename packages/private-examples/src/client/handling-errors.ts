import {isRpcError} from '@mionjs/core';
import {initClient} from '@mionjs/client';
import type {MyApi} from './auth-user.routes.ts';

const {routes} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

const [user, error, response] = await routes.users.getById('USER-404').call();
const thrown = response['@thrownErrors'];

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
} else if (isRpcError(response.auth)) {
  // the middleware's declared error; its onError hook gets it strongly typed
  console.log('auth failed:', response.auth.type);
} else if (thrown) {
  // transport, platform or any undeclared error lands here
  console.log('request failed:', thrown[0].type);
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
