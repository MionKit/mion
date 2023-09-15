import {initClient} from '@mionkit/client';

// importing only the RemoteApi type from server
import type {MyApi} from './server.routes';
import {ParamsValidationResponse} from '@mionkit/reflection';

const port = 8076;
const baseURL = `http://localhost:${port}`;
const {routes, hooks} = initClient<MyApi>({baseURL});

// calls sumTwo route in the server
const authSubRequest = hooks.auth('myToken-XYZ');
const sumTwoResp = await routes.utils.sum(5, 2).call(authSubRequest);
console.log(sumTwoResp); // 7

// prefills the token for any future requests, value is stored in localStorage
await hooks.auth('myToken-XYZ').prefill();
// // calls sumTwo route in the server
const sumTwoResponse = await routes.utils.sum(5, 2).call();
console.log(sumTwoResponse); // 7

// validate parameters locally without calling the server
const validationResp: ParamsValidationResponse = await routes.utils
    .sayHello({id: '123', name: 'John', surname: 'Doe'})
    .validate();
console.log(validationResp); // {hasErrors: false, totalErrors: 0, errors: []}
