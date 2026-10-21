import {initClient} from '@mionjs/client';
import type {MyApi} from './myApi.routes.ts';

const john = {id: '123', name: 'John', surname: 'Doe'};
const {routes} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

const [hello] = await routes.users.sayHello(john).call();
console.log(hello); // Hello John Doe

// checks params locally, without calling the server
const [_, error] = await routes.users.sayHello(john).typeErrors();
console.log(error); // {hasErrors: false, totalErrors: 0, errors: []}
