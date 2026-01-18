import {initClient} from '@mionkit/client';
import type {MyApi} from './server.routes';

const {routes} = initClient<MyApi>({
    baseURL: 'http://localhost:3000',
});

async function example() {
    // Call server method as if it were a local function
    const [greetings] = await routes.sayHello('World').call();
    console.log(greetings); // Hello World!
}

example();
