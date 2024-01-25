import {initClient} from '@mionkit/client';
// importing only the RemoteApi type from server
import type {MyApi} from './server.routes';

const john = {id: '123', name: 'John', surname: 'Doe'};
const {routes, hooks} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// prefills auth token for any future requests, value is stored in localStorage by default
await hooks.auth('myToken-XYZ').prefill();

// calls sayHello route in the server
const sayHello = await routes.users.sayHello(john).call();
console.log(sayHello); // Hello John Doe

// validate parameters locally without calling the server (await still required as validate is async)
const validationResp = await routes.users.sayHello(john).validate();
console.log(validationResp); // {hasErrors: false, totalErrors: 0, errors: []}
