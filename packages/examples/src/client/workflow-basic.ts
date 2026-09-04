import {initClient, routesFlow} from '@mionjs/client';
import type {HelloSumApi} from './hello-sum.routes.ts';

const {routes} = initClient<HelloSumApi>({baseURL: 'http://localhost:3000'});

// Execute multiple routes in a single HTTP request
const [[sum, greeting], [sumError, greetingError]] = await routesFlow([routes.utils.sum(5, 2), routes.sayHello('John')]).call();

// Results are returned as arrays in the same order as the routes
if (sumError) console.log('Sum error:', sumError.publicMessage);
else console.log('Sum:', sum); // 7

if (greetingError) console.log('Hello error:', greetingError.publicMessage);
else console.log(greeting); // Hello John
