import {initClient} from '@mionjs/client';
import type {FatalError} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';

const {routes, middleFns} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

// The result tuple is [result, error, fatal, middleFnResults, middleFnErrors]:
// - slot 1 (error) is the route's DECLARED errors | ValidationError - a CLOSED, strongly typed union
// - slot 2 (fatal) is anything NOBODY declared - an OPEN RpcError<string>
// - slot 4 (middleFnErrors) is each middleware function's DECLARED errors, strongly typed by name
const [user, error, fatal] = await routes.users.getById('USER-123').call();

// slot 2 is open: transport/framework codes narrow with NO cast
if (fatal?.type === 'request-timeout') console.log('took too long');
if (fatal?.type === 'request-aborted') console.log('canceled');

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
const lastFailure: FatalError | undefined = fatal;
console.log(lastFailure?.publicMessage);

// slot 4 is a typed record keyed by the names YOU passed - each middleware function's declared errors narrow
const [, , , , middleFnErrors] = await routes.users.getById('USER-123').call({
  middleFns: {
    auth: middleFns.auth({headers: {Authorization: 'Bearer token'}}, true),
  },
});
if (middleFnErrors?.auth?.type === 'not-authorized') {
  // errorData is strongly typed as NotAuthorizedData
  console.log('auth failed:', middleFnErrors.auth.errorData?.reason);
}
// only the middleware function names you passed exist on the record
// @ts-expect-error -- no middleware function named `bogus` was passed to this call
console.log(middleFnErrors?.bogus);
