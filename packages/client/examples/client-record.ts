import {initClient} from '@mionkit/client';

// importing type only from server
import type {MyApi} from './server-record.routes';

const port = 8076;
const baseURL = `http://localhost:${port}`;
const {methods} = initClient<MyApi>({baseURL});

// lets prefill auth token
await methods.auth('myToken123').prefill();

// now lets change remoteh methods
const sumResult = await methods.utils.sum5(5).call();
console.log(sumResult); // 10 👍
