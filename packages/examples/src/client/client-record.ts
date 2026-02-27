import {initClient} from '@mionkit/client';

// importing type only from server
import type {MyApi} from './server-record.routes.ts';
import {HeadersSubset} from '@mionkit/core';

const {routes, middleFns} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

// lets prefill auth token
await middleFns.auth(new HeadersSubset({Authorization: 'myToken-XYZ'})).prefill();

// now lets change remoteh methods
const sumResult = await routes.utils.sum5(5).call();
console.log(sumResult); // 10 👍
