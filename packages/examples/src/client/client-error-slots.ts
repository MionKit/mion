import {initClient} from '@mionjs/client';
import type {UnexpectedError} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// The result tuple is [result, error, unexpected, middleFnResults]:
// - slot 1 (error) is the route's DECLARED errors | ValidationError - a CLOSED, strongly typed union
// - slot 2 (unexpected) is anything the route did not declare - an OPEN RpcError<string>
const [user, error, unexpected] = await routes.users.getById('USER-123').call();

// slot 2 is open: transport/framework codes narrow with NO cast
if (unexpected?.type === 'request-timeout') console.log('took too long');
if (unexpected?.type === 'request-aborted') console.log('canceled');

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
const lastFailure: UnexpectedError | undefined = unexpected;
console.log(lastFailure?.publicMessage);

// slot 2 is the unexpected error, NOT the middleFn record the old tuple kept there
// @ts-expect-error -- an RpcError has no per-middleFn keys
console.log(unexpected?.auth);
