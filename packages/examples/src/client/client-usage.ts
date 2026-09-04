/* eslint-disable @typescript-eslint/no-unused-vars */
import {initClient} from '@mionjs/client';
import {HeadersSubset} from '@mionjs/core';
// importing only the RemoteApi type from server
import type {MyApi} from './server.routes.ts';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// calls the sum route passing middleware function data to call()
// Returns 5-tuple: [routeResult, routeError, fatal, middleFnResults, middleFnErrors]
const [sumResult, sumError, fatal, middleFnResults, middleFnErrors] = await routes.utils.sum(5, 2).call({
  middleFns: {
    auth: middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})),
  },
});
console.log(sumResult); // 7
console.log(sumError); // undefined (the route's DECLARED errors | ValidationError)
console.log(fatal); // undefined (transport, platform, framework, or an undeclared throw)
console.log(middleFnResults); // { auth: ... }
console.log(middleFnErrors); // {} (each middleware function's DECLARED errors, by name)

// prefills the token for any future requests, value is stored in localStorage
middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})).prefill();

// calls sumTwo route in the server (auth is prefilled, so call() works)
// Returns 5-tuple: [routeResult, routeError, fatal, middleFnResults, middleFnErrors]
const [sumTwoResponse, sumTwoError] = await routes.utils.sum(5, 2).call();
if (!sumTwoError) {
  console.log(sumTwoResponse); // 7
}

// validate parameters locally without calling the server
const validationResp = await routes.users.sayHello({id: '123', name: 'John', surname: 'Doe'}).typeErrors();
console.log(validationResp); // []
