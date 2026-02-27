/* eslint-disable @typescript-eslint/no-unused-vars */
import {initClient} from '@mionkit/client';
import {HeadersSubset} from '@mionkit/core';
// importing only the RemoteApi type from server
import type {MyApi} from './server.routes.ts';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

async function examples() {
    // calls sumTwo route in the server using callWithMiddleFns API
    // Returns 4-tuple: [routeResult, routeError, middleFnsResults, middleFnsErrors]
    const [sumResult, sumError, middleFnResults, middleFnErrors] = await routes.utils.sum(5, 2).callWithMiddleFns({
        auth: middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})),
    });
    console.log(sumResult); // 7
    console.log(sumError); // undefined
    console.log(middleFnResults); // { auth: ... }
    console.log(middleFnErrors); // {}

    // prefills the token for any future requests, value is stored in localStorage
    middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})).prefill();

    // calls sumTwo route in the server (auth is prefilled, so call() works)
    // Returns 4-tuple: [routeResult, routeError, middleFnsResults, middleFnsErrors]
    const [sumTwoResponse, sumTwoError] = await routes.utils.sum(5, 2).call();
    if (!sumTwoError) {
        console.log(sumTwoResponse); // 7
    }

    // validate parameters locally without calling the server
    const validationResp = await routes.users.sayHello({id: '123', name: 'John', surname: 'Doe'}).typeErrors();
    console.log(validationResp); // []
}
