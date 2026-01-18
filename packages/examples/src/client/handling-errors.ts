import {initClient} from '@mionkit/client';

// importing type only from server
import type {MyApi} from './server.routes';
import {isRpcError} from '@mionkit/core';

const {routes, hooks} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// ========== Result pattern (never throws) ==========
// call() and callWithHooks() always return a 4-tuple, never throw
// [routeResult, routeError, hooksResults, hooksErrors]

// calls sayHello route in the server
// Partial destructuring still works for backward compatibility
const [sayHello, error] = await routes.users.sayHello({id: '123', name: 'John', surname: 'Doe'}).call();

if (error) {
    // in this case the request has failed because the authorization hook is missing
    console.log(error); // { type: 'validation-error', message: `Invalid params for Route or Hook 'auth'.`}

    if (isRpcError(error)) {
        // ... handle the error as required
    }
} else {
    console.log(sayHello); // Hello John Doe
}

// ========== Full 4-tuple with hooks ==========
// callWithHooks() returns [routeResult, routeError, hooksResults, hooksErrors]
const [greeting, routeError, hookResults, hookErrors] = await routes.users
    .sayHello({
        id: '123',
        name: 'John',
        surname: 'Doe',
    })
    .callWithHooks({
        auth: hooks.auth({headers: {Authorization: 'Bearer token'}}),
    });

if (routeError) {
    console.log('Route failed:', routeError.type);
} else {
    console.log(greeting); // Hello John Doe
}

// Check hook errors
if (hookErrors?.auth) {
    console.log('Auth hook failed:', hookErrors.auth.type);
}

// Access hook results
console.log('Hook results:', hookResults);

// ========== Validation throws errors ==========
// Note: typeErrors() is the only method that can throw

try {
    // Validation throws an error when validation fails
    const errors = await routes.users.sayHello(null as any).typeErrors();
    console.log(errors); // [] (empty array if no errors)
} catch (validationError: any) {
    console.log(validationError); // { type: 'validation-error', message: `Invalid params ...`, errorData : {...}}
}
