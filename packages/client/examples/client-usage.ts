import {initClient} from '@mionkit/client';

// importing only the RemoteApi type from server
import type {MyApi} from './server.routes';

const {routes, hooks} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// calls sumTwo route in the server using callWithHooks API
const {data: sumTwoResp} = await routes.utils.sum(5, 2).callWithHooks({
    auth: hooks.auth(['myToken-XYZ']),
});
console.log(sumTwoResp.route); // 7

// prefills the token for any future requests, value is stored in localStorage
hooks.auth(['myToken-XYZ']).prefill();

// calls sumTwo route in the server (auth is prefilled, so call() works)
const {data: sumTwoResponse, error: sumError} = await routes.utils.sum(5, 2).call();
if (!sumError) {
    console.log(sumTwoResponse); // 7
}

// validate parameters locally without calling the server
const validationResp = await routes.users.sayHello({id: '123', name: 'John', surname: 'Doe'}).typeErrors();
console.log(validationResp); // []
