/* eslint-disable @typescript-eslint/no-unused-vars */
import {initClient} from '@mionjs/client';
import {HeadersSubset} from '@mionjs/core';
// importing only the RemoteApi type from server
import type {MyApi} from './server.routes.ts';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// calls sumTwo route in the server using call with middleFns API
// Returns 4-tuple: [routeResult, routeError, unexpected, middleFnResults]
const [sumResult, sumError, unexpected, middleFnResults] = await routes.utils.sum(5, 2).call({
    middleFns: {
        auth: middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})),
    },
});
console.log(sumResult); // 7
console.log(sumError); // undefined (the route's DECLARED errors | ValidationError)
console.log(unexpected); // undefined (anything the route did not declare: middleFn or fatal errors)
console.log(middleFnResults); // { auth: ... }

// prefills the token for any future requests, value is stored in localStorage
middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})).prefill();

// calls sumTwo route in the server (auth is prefilled, so call() works)
// Returns 4-tuple: [routeResult, routeError, unexpected, middleFnsResults]
const [sumTwoResponse, sumTwoError] = await routes.utils.sum(5, 2).call();
if (!sumTwoError) {
    console.log(sumTwoResponse); // 7
}

// validate parameters locally without calling the server
const validationResp = await routes.users.sayHello({id: '123', name: 'John', surname: 'Doe'}).typeErrors();
console.log(validationResp); // []
