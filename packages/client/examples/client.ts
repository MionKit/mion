import {initClient} from '@mionkit/client';

// importing type only from server
import type {MyApi} from './server.routes';
import {ParamsValidationResponse} from '@mionkit/runtype';

const port = 8076;
const baseURL = `http://localhost:${port}`;
const {methods, client} = initClient<MyApi>({baseURL});

// prefills the token for any future requests, value is stored in localStorage
await methods.auth('myToken-XYZ').prefill();

// calls sayHello route in the server
const sayHello = await methods.utils.sayHello({id: '123', name: 'John', surname: 'Doe'}).call();
console.log(sayHello); // Hello John Doe

// calls sumTwo route in the server
const sumTwoResp = await methods.utils.sum(5, 2).call();
console.log(sumTwoResp); // 7

// validate parameters locally without calling the server
const validationResp: ParamsValidationResponse = await methods.utils
    .sayHello({id: '123', name: 'John', surname: 'Doe'})
    .validate();
console.log(validationResp); // {hasErrors: false, totalErrors: 0, errors: []}