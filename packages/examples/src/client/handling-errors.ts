import {initClient} from '@mionjs/client';

// importing type only from server
import type {MyApi} from './server.routes.ts';
import {isRpcError} from '@mionjs/core';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// ========== Result pattern (never throws) ==========
// call() always returns a 4-tuple, never throws
// [routeResult, routeError, unexpected, middleFnsResults]
// - routeError: the route's DECLARED errors | ValidationError (strongly typed, CLOSED union)
// - unexpected: anything the route did not declare - a middleFn error, transport,
//   platform or an undeclared throw (untyped RpcError<string>, OPEN)

// calls sayHello route in the server
const [sayHello, error, unexpected] = await routes.users.sayHello({id: '123', name: 'John', surname: 'Doe'}).call();

if (error) {
    // the route's own declared error or a validation error for its params
    console.log(error.type);
} else if (unexpected) {
    // in this case the request has failed because the authorization middleFn is missing:
    // that is not the route's error, so it surfaces here
    console.log(unexpected); // { type: 'validation-error', message: `Invalid params for Route or MiddleFn 'auth'.`}

    if (isRpcError(unexpected)) {
        // ... handle the error as required
    }
} else {
    console.log(sayHello); // Hello John Doe
}

// ========== Full 4-tuple with middleFns ==========
// call({middleFns: {...}}) returns [routeResult, routeError, unexpected, middleFnsResults]
const [greeting, routeError, unexpectedError, middleFnResults] = await routes.users
    .sayHello({id: '123', name: 'John', surname: 'Doe'})
    .call({
        middleFns: {
            auth: middleFns.auth({headers: {Authorization: 'Bearer token'}}),
        },
    });

if (routeError) {
    console.log('Route failed:', routeError.type);
} else if (unexpectedError) {
    // a middleFn failure (e.g. auth) or any undeclared error lands here
    console.log('Request failed:', unexpectedError.type);
} else {
    console.log(greeting); // Hello John Doe
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
