import {initClient} from '@mionjs/client';
import type {UndeclaredError} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

// The result tuple is [result, error, undeclared, middlewareResults, middlewareErrors]:
// - slot 1 (error) is the route's DECLARED errors | ValidationError - a CLOSED, strongly typed union
// - slot 2 (undeclared) is anything NOBODY declared - an OPEN RpcError<string>. A returned FatalError
//   is declared, so it lands in slot 1 or 4, never here
// - slot 4 (middlewareErrors) is each middleware's DECLARED errors, by middleware id
const [user, error, undeclared] = await routes.users.getById('USER-123').call();

// slot 2 is open: transport/framework codes narrow with NO cast
if (undeclared?.type === 'request-timeout') console.log('took too long');
if (undeclared?.type === 'request-aborted') console.log('canceled');

// slot 1 stays CLOSED: a transport code can never be part of the route's typed union
// @ts-expect-error -- shown on purpose; the assertion fails the build if this ever stops erroring
if (error?.type === 'request-timeout') console.log('unreachable');

// an exhaustive switch over the route's declared union compiles, ending in a `never` check
if (user === undefined && error) {
  switch (error.type) {
    case 'user-not-found':
      // declared payloads survive narrowing: errorData is UserNotFoundData
      console.log('missing user:', error.errorData?.requestedId);
      break;
    case 'validation-error':
      // ValidationError keeps its ValidationErrorData payload
      console.log('type errors:', error.errorData?.typeErrors.length);
      break;
    default: {
      const exhaustive: never = error;
      console.log(exhaustive);
    }
  }
}

// unknown fields on a declared payload stay rejected
// @ts-expect-error -- UserNotFoundData has no `bogus` field
if (error?.type === 'user-not-found') console.log(error.errorData?.bogus);

// slot 2's type is exported for signatures
const lastFailure: UndeclaredError | undefined = undeclared;
console.log(lastFailure?.publicMessage);

// a middleware's declared errors are strongly typed in its onError hook
middlewares.auth
  .onRequest((auth) => auth({headers: {Authorization: 'Bearer token'}}, true))
  .onError('not-authorized', (authError) => {
    // errorData is strongly typed as NotAuthorizedData
    console.log('auth failed:', authError.errorData?.reason);
  });

// slot 4 keeps the same errors by middleware id, typed only as RpcError
const [, , , , middlewareErrors] = await routes.users
  .getById('USER-123')
  .call();
if (middlewareErrors?.auth)
  console.log('auth failed:', middlewareErrors.auth.type);
