import {initClient} from '@mionjs/client';
// importing only the RemoteApi type from server
import type {MyApi} from './myApi.routes.ts';

const john = {id: '123', name: 'John', surname: 'Doe'};
const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// prefills auth token for any future requests, value is stored in localStorage by default
await middleFns.auth({headers: {Authorization: 'myToken-XYZ'}}).prefill();

// calls sayHello route in the server
const [hello] = await routes.users.sayHello(john).call();
console.log(hello); // Hello John Doe

// validate parameters locally without calling the server (await still required as typeErrors is async)
const [_, error] = await routes.users.sayHello(john).typeErrors();
console.log(error); // {hasErrors: false, totalErrors: 0, errors: []}
