import {initClient, batch} from '@mionjs/client';
import type {MyApi} from './hello-sum.routes.ts';

const {routes} = initClient<MyApi>({baseURL: 'http://localhost:3000'});

const [[sum, greeting], [sumError, greetingError]] = await batch([
  routes.utils.sum(5, 2),
  routes.sayHello('John'),
]).call();

if (sumError) console.log('Sum error:', sumError.publicMessage);
else console.log('Sum:', sum); // 7

if (greetingError) console.log('Hello error:', greetingError.publicMessage);
else console.log(greeting); // Hello John
