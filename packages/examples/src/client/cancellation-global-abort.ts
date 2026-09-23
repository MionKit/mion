import {initClient} from '@mionjs/client';
import type {MyApi} from './hello-sum.routes.ts';

const {client, routes} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});

const p1 = routes.sayHello('John').call();
const p2 = routes.utils.sum(5, 2).call();

client.abort();

// both come back as 'request-aborted' in the undeclared slot
const [, , fatal1] = await p1;
const [, , fatal2] = await p2;
if (fatal1?.type === 'request-aborted') console.log('first request canceled');
if (fatal2?.type === 'request-aborted') console.log('second request canceled');

// new requests work normally after abort
const [greeting] = await routes.sayHello('John').call();
console.log(greeting);
