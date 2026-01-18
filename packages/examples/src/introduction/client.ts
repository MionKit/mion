import {initClient} from '@mionkit/client';
// importing only the RemoteApi type from server
import type {MyApi} from './myApi.routes';

const john = {id: '123', name: 'John', surname: 'Doe'};
const {routes, hooks} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

async function example() {
    // prefills auth token for any future requests, value is stored in localStorage by default
    await hooks.auth({headers: {Authorization: 'myToken-XYZ'}}).prefill();

    // calls sayHello route in the server
    const [hello] = await routes.users.sayHello(john).call();
    console.log(hello); // Hello John Doe

    // validate parameters locally without calling the server (await still required as typeErrors is async)
    const [_, error] = await routes.users.sayHello(john).typeErrors();
    console.log(error); // {hasErrors: false, totalErrors: 0, errors: []}
}

example();

