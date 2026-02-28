import {initClient} from '@mionkit/client';
import type {MyApi} from './about-server.ts';

const {routes} = initClient<MyApi>({
    baseURL: 'http://localhost:3000',
});

// Call server method as if it were a local function
const [hello] = await routes.sayHello('World').call();
console.log(hello); // hello world
