/* eslint-disable @typescript-eslint/no-unused-vars */
import {initClient} from '@mionkit/client';
import {HeadersSubset} from '@mionkit/core';
// importing only the RemoteApi type from server
import type {MyApi} from './server.routes';

const {routes, hooks} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

async function examples() {
    // calls sumTwo route in the server using callWithHooks API
    // Returns 4-tuple: [routeResult, routeError, hooksResults, hooksErrors]
    const [sumResult, sumError, hookResults, hookErrors] = await routes.utils.sum(5, 2).callWithHooks({
        auth: hooks.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})),
    });
    console.log(sumResult); // 7
    console.log(sumError); // undefined
    console.log(hookResults); // { auth: ... }
    console.log(hookErrors); // {}

    // prefills the token for any future requests, value is stored in localStorage
    hooks.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})).prefill();

    // calls sumTwo route in the server (auth is prefilled, so call() works)
    // Returns 4-tuple: [routeResult, routeError, hooksResults, hooksErrors]
    const [sumTwoResponse, sumTwoError] = await routes.utils.sum(5, 2).call();
    if (!sumTwoError) {
        console.log(sumTwoResponse); // 7
    }

    // validate parameters locally without calling the server
    const validationResp = await routes.users.sayHello({id: '123', name: 'John', surname: 'Doe'}).typeErrors();
    console.log(validationResp); // []
}
