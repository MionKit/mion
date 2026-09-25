import {initClient} from '@mionjs/client';
// importing only the RemoteApi type from server
import type {MyApi} from './server.routes.ts';
import {HeadersSubset} from '@mionjs/core';

const john = {id: '123', name: 'John', surname: 'Doe'};
const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

// sets the auth token before every request that runs the auth middleware
middlewares.auth.onRequest((auth) =>
  auth(new HeadersSubset({Authorization: 'myToken-XYZ'}))
);

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
