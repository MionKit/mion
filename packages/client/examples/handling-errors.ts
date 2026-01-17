import {initClient} from '@mionkit/client';

// importing type only from server
import type {MyApi} from './server.routes';
import {isRpcError} from '@mionkit/core';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// ========== Result pattern (never throws) ==========
// call() always returns a Result tuple [data, error], never throws

// calls sayHello route in the server
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

// ========== Validation throws errors ==========
// Note: typeErrors() is the only method that can throw

try {
    // Validation throws an error when validation fails
    const errors = await routes.users.sayHello(null as any).typeErrors();
    console.log(errors); // [] (empty array if no errors)
} catch (validationError: any) {
    console.log(validationError); // { type: 'validation-error', message: `Invalid params ...`, errorData : {...}}
}
