import {initClient} from '@mionkit/client';

// importing only the RemoteApi type from server
import type {MyApi} from './server.routes';
import type {RunTypeError} from '@mionkit/core';

const {routes, hooks} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// calls sumTwo route in the server using chainable hooks API
const sumTwoResp = await routes.utils.sum(5, 2).hooks(hooks.auth('myToken-XYZ')).call();
console.log(sumTwoResp); // 7

// prefills the token for any future requests, value is stored in localStorage
await hooks.auth('myToken-XYZ').prefill();
// // calls sumTwo route in the server
const sumTwoResponse = await routes.utils.sum(5, 2).call();
console.log(sumTwoResponse); // 7

// validate parameters locally without calling the server
const validationResp: RunTypeError[] = await routes.users.sayHello({id: '123', name: 'John', surname: 'Doe'}).typeErrors();
console.log(validationResp); // {hasErrors: false, totalErrors: 0, errors: []}
