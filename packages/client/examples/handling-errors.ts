import {initClient} from '@mionkit/client';

// importing type only from server
import type {MyApi} from './server.routes';
import {isRpcError, RpcError} from '@mionkit/core';

const port = 8076;
const baseURL = `http://localhost:${port}`;
const {routes} = initClient<MyApi>({baseURL});

try {
    // calls sayHello route in the server
    const sayHello = await routes.utils.sayHello({id: '123', name: 'John', surname: 'Doe'}).call();
    console.log(sayHello); // Hello John Doe
} catch (error: RpcError | any) {
    // in this case the request has failed because the authorization hook is missing
    console.log(error); // {statusCode: 400, name: 'Validation Error', message: `Invalid params for Route or Hook 'auth'.`}

    if (isRpcError(error)) {
        // ... handle the error as required
    }
}

try {
    // Validation throws an error when validation fails
    const sayHello = await routes.utils.sayHello(null as any).validate();
    console.log(sayHello); // Hello John Doe
} catch (error: RpcError | any) {
    console.log(error); // { statusCode: 400, name: 'Validation Error', message: `Invalid params ...`, errorData : {...}}
}
