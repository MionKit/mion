import {initClient} from '@mionjs/client';

// importing type only from server
import type {MyApi} from './server.routes.ts';
import {isRpcError} from '@mionjs/core';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// ========== Result pattern (never throws) ==========
// call() and callWithMiddleFns() always return a 4-tuple, never throw
// [routeResult, routeError, middleFnsResults, middleFnsErrors]

// calls sayHello route in the server
const [sayHello, error] = await routes.users.sayHello({id: '123', name: 'John', surname: 'Doe'}).call();

if (error) {
    // in this case the request has failed because the authorization middleFn is missing
    console.log(error); // { type: 'validation-error', message: `Invalid params for Route or MiddleFn 'auth'.`}

    if (isRpcError(error)) {
        // ... handle the error as required
    }
} else {
    console.log(sayHello); // Hello John Doe
}

// ========== Full 4-tuple with middleFns ==========
// callWithMiddleFns() returns [routeResult, routeError, middleFnsResults, middleFnsErrors]
const [greeting, routeError, middleFnResults, middleFnErrors] = await routes.users
    .sayHello({id: '123', name: 'John', surname: 'Doe'})
    .callWithMiddleFns({
        auth: middleFns.auth({headers: {Authorization: 'Bearer token'}}),
    });

if (routeError) {
    console.log('Route failed:', routeError.type);
} else {
    console.log(greeting); // Hello John Doe
}

// Check middleFn errors
if (middleFnErrors?.auth) {
    console.log('Auth middleFn failed:', middleFnErrors.auth.type);
}

// Access middleFn results
console.log('MiddleFn results:', middleFnResults);

// ========== Validation throws errors ==========
// Note: typeErrors() is the only method that can throw

try {
    // Validation throws an error when validation fails
    const errors = await routes.users.sayHello(null as any).typeErrors();
    console.log(errors); // [] (empty array if no errors)
} catch (validationError: any) {
    console.log(validationError); // { type: 'validation-error', message: `Invalid params ...`, errorData : {...}}
}
