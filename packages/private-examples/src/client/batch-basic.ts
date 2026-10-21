import {initClient, batch} from '@mionjs/client';
import type {MyApi} from './hello-sum.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

const [[sum, sumError, response], [greeting, greetingError, sameResponse]] =
  await batch([routes.utils.sum(5, 2), routes.sayHello('John')]).call();

console.log(response === sameResponse); // true, one response per batch

if (sumError) console.log('Sum error:', sumError.publicMessage);
else if (sum !== undefined) console.log('Sum:', sum); // 7

if (greetingError) console.log('Hello error:', greetingError.publicMessage);
else if (greeting !== undefined) console.log(greeting); // Hello John

// both slots are empty when the error happened outside the routes
if (response['@thrownErrors'])
  console.log('Batch failed:', response['@thrownErrors'][0].publicMessage);
