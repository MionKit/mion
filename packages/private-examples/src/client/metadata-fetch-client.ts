import {initClient} from '@mionjs/client';
import {useMethodsMetadata} from '@mionjs/client/middlewares';
import type {MyApi} from './metadata-fetch.routes.ts';

const {routes, middlewares} = initClient<MyApi>({
  baseURL: 'http://localhost:3000',
});
useMethodsMetadata(middlewares.mionMethodsMetadata);

// the first call asks the server how sayHello works
const [greeting] = await routes.sayHello('Ana').call();
console.log(greeting);
