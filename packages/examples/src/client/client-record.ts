import {initClient} from '@mionkit/client';

// importing type only from server
import type {MyApi} from './server-record.routes';

const {routes, hooks} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// lets prefill auth token
await hooks.auth('myToken123').prefill();

// now lets change remoteh methods
const sumResult = await routes.utils.sum5(5).call();
console.log(sumResult); // 10 👍
