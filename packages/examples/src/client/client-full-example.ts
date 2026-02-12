import {initClient} from '@mionkit/client';
// importing only the RemoteApi type from server
import type {MyApi} from './server.routes.ts';
import {HeadersSubset} from '@mionkit/core';

const john = {id: '123', name: 'John', surname: 'Doe'};
const {routes, linkedFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

async function fullExample() {
    // prefills auth token for any future requests, value is stored in localStorage by default
    await linkedFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})).prefill();

    // calls sayHello route in the server - call() returns [result, error] tuple
    const [greeting, error] = await routes.users.sayHello(john).call();
    if (error) {
        console.log('Error:', error.publicMessage);
    } else {
        console.log(greeting); // Hello John Doe
    }

    // validate parameters locally without calling the server
    const validationErrors = await routes.users.sayHello(john).typeErrors();
    console.log(validationErrors); // [] (empty array if no errors)
}
