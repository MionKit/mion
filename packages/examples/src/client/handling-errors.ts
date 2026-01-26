import {initClient} from '@mionkit/client';

// importing type only from server
import type {MyApi} from './server.routes';
import {isRpcError} from '@mionkit/core';

const {routes, linkedFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// ========== Result pattern (never throws) ==========
// call() and callWithLinkedFns() always return a 4-tuple, never throw
// [routeResult, routeError, linkedFnsResults, linkedFnsErrors]

// calls sayHello route in the server
const [sayHello, error] = await routes.users.sayHello({id: '123', name: 'John', surname: 'Doe'}).call();

if (error) {
    // in this case the request has failed because the authorization linkedFn is missing
    console.log(error); // { type: 'validation-error', message: `Invalid params for Route or LinkedFn 'auth'.`}

    if (isRpcError(error)) {
        // ... handle the error as required
    }
} else {
    console.log(sayHello); // Hello John Doe
}

// ========== Full 4-tuple with linkedFns ==========
// callWithLinkedFns() returns [routeResult, routeError, linkedFnsResults, linkedFnsErrors]
const [greeting, routeError, linkedFnResults, linkedFnErrors] = await routes.users
    .sayHello({id: '123', name: 'John', surname: 'Doe'})
    .callWithLinkedFns({
        auth: linkedFns.auth({headers: {Authorization: 'Bearer token'}}),
    });

if (routeError) {
    console.log('Route failed:', routeError.type);
} else {
    console.log(greeting); // Hello John Doe
}

// Check linkedFn errors
if (linkedFnErrors?.auth) {
    console.log('Auth linkedFn failed:', linkedFnErrors.auth.type);
}

// Access linkedFn results
console.log('LinkedFn results:', linkedFnResults);

// ========== Validation throws errors ==========
// Note: typeErrors() is the only method that can throw

try {
    // Validation throws an error when validation fails
    const errors = await routes.users.sayHello(null as any).typeErrors();
    console.log(errors); // [] (empty array if no errors)
} catch (validationError: any) {
    console.log(validationError); // { type: 'validation-error', message: `Invalid params ...`, errorData : {...}}
}
