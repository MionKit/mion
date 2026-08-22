import {initClient} from '@mionjs/client';

// importing type only from server
import type {MyApi} from './server.routes.ts';
import {isRpcError} from '@mionjs/core';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// ========== Result pattern (never throws) ==========
// call() always returns a 5-tuple, never throws
// [routeResult, routeError, fatal, middleFnResults, middleFnErrors]
// - routeError: the route's DECLARED errors | ValidationError (strongly typed, CLOSED union)
// - fatal: anything NOBODY declared - transport, platform, framework, an undeclared throw,
//   or an error for a middleFn that was not part of the request (untyped RpcError<string>, OPEN)
// - middleFnErrors: each middleFn's DECLARED errors, by name (strongly typed)

// calls sayHello route in the server
const [sayHello, error, fatal] = await routes.users.sayHello({id: '123', name: 'John', surname: 'Doe'}).call();

if (error) {
    // the route's own declared error or a validation error for its params
    console.log(error.type);
} else if (fatal) {
    // in this case the request has failed because the authorization middleFn was never sent:
    // an error for a middleFn that is not part of the request is fatal
    console.log(fatal); // { type: 'validation-error', message: `Invalid params for Route or MiddleFn 'auth'.`}

    if (isRpcError(fatal)) {
        // ... handle the error as required
    }
} else {
    console.log(sayHello); // Hello John Doe
}

// ========== Full 5-tuple with middleFns ==========
// call({middleFns: {...}}) returns [routeResult, routeError, fatal, middleFnResults, middleFnErrors]
const [greeting, routeError, fatalError, middleFnResults, middleFnErrors] = await routes.users
    .sayHello({id: '123', name: 'John', surname: 'Doe'})
    .call({
        middleFns: {
            auth: middleFns.auth({headers: {Authorization: 'Bearer token'}}),
        },
    });

if (routeError) {
    console.log('Route failed:', routeError.type);
} else if (fatalError) {
    // transport, platform or any undeclared error lands here
    console.log('Request failed:', fatalError.type);
} else {
    console.log(greeting); // Hello John Doe
}

// Each middleFn's declared errors arrive by name, strongly typed
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
