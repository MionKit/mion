import {initClient} from '@mionjs/client';
import type {MyApi} from './server.routes.ts';

const {client, routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// start multiple requests
const p1 = routes.users.sayHello({id: '1', name: 'John', surname: 'Doe'}).call();
const p2 = routes.utils.sum(5, 2).call();

// cancel ALL in-flight requests (e.g. user navigated away)
client.abort();

// both return 'request-aborted' errors
const [, err1] = await p1; // err1.type === 'request-aborted'
const [, err2] = await p2; // err2.type === 'request-aborted'

// new requests work normally after abort
const [greeting] = await routes.users.sayHello({id: '1', name: 'John', surname: 'Doe'}).call();
